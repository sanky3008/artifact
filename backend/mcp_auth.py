import secrets
import time
from urllib.parse import urlencode

import httpx
from pydantic import AnyUrl
from mcp.shared.auth import OAuthClientInformationFull, OAuthToken
from mcp.server.auth.provider import AuthorizationParams
from fastmcp.server.auth import OAuthProvider, AccessToken
from fastmcp.server.auth.auth import AuthorizationCode, RefreshToken, ClientRegistrationOptions

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"

SESSION_TTL = 86400  # 24 hours, matches main app


class ArtifactOAuthProvider(OAuthProvider):
    """MCP OAuth provider that delegates identity to Google Sign-In
    and gates access on the configured email domain."""

    def __init__(
        self,
        base_url: str,
        google_client_id: str,
        google_client_secret: str,
        allowed_domain: str,
    ):
        super().__init__(
            base_url=base_url,
            client_registration_options=ClientRegistrationOptions(enabled=True),
        )
        self.google_client_id = google_client_id
        self.google_client_secret = google_client_secret
        self.allowed_domain = allowed_domain.lower()

        self._clients: dict[str, OAuthClientInformationFull] = {}
        self._pending_google: dict[str, dict] = {}
        self._auth_codes: dict[str, AuthorizationCode] = {}
        self._code_emails: dict[str, str] = {}
        self._access_tokens: dict[str, AccessToken] = {}
        self._refresh_tokens: dict[str, RefreshToken] = {}
        self._refresh_emails: dict[str, str] = {}

    # -- client registration --------------------------------------------------

    async def get_client(self, client_id: str) -> OAuthClientInformationFull | None:
        return self._clients.get(client_id)

    async def register_client(self, client_info: OAuthClientInformationFull) -> None:
        if client_info.client_id:
            self._clients[client_info.client_id] = client_info

    # -- authorization ---------------------------------------------------------

    async def authorize(
        self, client: OAuthClientInformationFull, params: AuthorizationParams
    ) -> str:
        google_state = secrets.token_urlsafe(32)
        self._pending_google[google_state] = {
            "client_id": client.client_id,
            "redirect_uri": str(params.redirect_uri),
            "mcp_state": params.state,
            "code_challenge": params.code_challenge,
            "redirect_uri_provided_explicitly": params.redirect_uri_provided_explicitly,
            "scopes": params.scopes or [],
            "resource": params.resource,
            "expires": time.time() + 600,
        }

        callback_url = str(self.base_url).rstrip("/") + "/google/callback"
        google_params = {
            "client_id": self.google_client_id,
            "redirect_uri": callback_url,
            "response_type": "code",
            "scope": "openid email",
            "state": google_state,
            "access_type": "offline",
            "prompt": "consent",
        }
        return f"{GOOGLE_AUTH_URL}?{urlencode(google_params)}"

    async def handle_google_callback(self, code: str, state: str) -> tuple[str, str, str | None]:
        """Exchange Google auth code, verify domain, return (mcp_code, redirect_uri, mcp_state)."""
        pending = self._pending_google.pop(state, None)
        if not pending or time.time() > pending["expires"]:
            raise ValueError("Invalid or expired authorization state")

        callback_url = str(self.base_url).rstrip("/") + "/google/callback"

        async with httpx.AsyncClient() as http:
            token_resp = await http.post(
                GOOGLE_TOKEN_URL,
                data={
                    "code": code,
                    "client_id": self.google_client_id,
                    "client_secret": self.google_client_secret,
                    "redirect_uri": callback_url,
                    "grant_type": "authorization_code",
                },
            )
            token_resp.raise_for_status()
            tokens = token_resp.json()

            info_resp = await http.get(
                GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {tokens['access_token']}"},
            )
            info_resp.raise_for_status()
            userinfo = info_resp.json()

        email = userinfo.get("email", "")
        domain = email.split("@")[-1].lower()
        if domain != self.allowed_domain:
            raise PermissionError(f"Only @{self.allowed_domain} accounts are allowed")

        mcp_code = secrets.token_urlsafe(32)
        self._auth_codes[mcp_code] = AuthorizationCode(
            code=mcp_code,
            scopes=pending["scopes"],
            expires_at=time.time() + 300,
            client_id=pending["client_id"],
            code_challenge=pending["code_challenge"],
            redirect_uri=AnyUrl(pending["redirect_uri"]),
            redirect_uri_provided_explicitly=pending["redirect_uri_provided_explicitly"],
            resource=pending["resource"],
        )
        self._code_emails[mcp_code] = email

        return mcp_code, pending["redirect_uri"], pending.get("mcp_state")

    # -- authorization code exchange -------------------------------------------

    async def load_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: str
    ) -> AuthorizationCode | None:
        ac = self._auth_codes.get(authorization_code)
        if ac and time.time() <= ac.expires_at:
            return ac
        self._auth_codes.pop(authorization_code, None)
        self._code_emails.pop(authorization_code, None)
        return None

    async def exchange_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: AuthorizationCode
    ) -> OAuthToken:
        email = self._code_emails.pop(authorization_code.code, "unknown")
        self._auth_codes.pop(authorization_code.code, None)

        access_token = secrets.token_urlsafe(32)
        self._access_tokens[access_token] = AccessToken(
            token=access_token,
            client_id=client.client_id or "",
            scopes=authorization_code.scopes,
            expires_at=int(time.time()) + SESSION_TTL,
            claims={"email": email},
        )

        refresh_token = secrets.token_urlsafe(32)
        self._refresh_tokens[refresh_token] = RefreshToken(
            token=refresh_token,
            client_id=client.client_id or "",
            scopes=authorization_code.scopes,
        )
        self._refresh_emails[refresh_token] = email

        return OAuthToken(
            access_token=access_token,
            token_type="Bearer",
            expires_in=SESSION_TTL,
            refresh_token=refresh_token,
        )

    # -- token validation & refresh --------------------------------------------

    async def load_access_token(self, token: str) -> AccessToken | None:
        at = self._access_tokens.get(token)
        if at and (at.expires_at is None or time.time() <= at.expires_at):
            return at
        self._access_tokens.pop(token, None)
        return None

    async def load_refresh_token(
        self, client: OAuthClientInformationFull, refresh_token: str
    ) -> RefreshToken | None:
        return self._refresh_tokens.get(refresh_token)

    async def exchange_refresh_token(
        self,
        client: OAuthClientInformationFull,
        refresh_token: RefreshToken,
        scopes: list[str],
    ) -> OAuthToken:
        email = self._refresh_emails.pop(refresh_token.token, "unknown")
        self._refresh_tokens.pop(refresh_token.token, None)

        new_access = secrets.token_urlsafe(32)
        effective_scopes = scopes or refresh_token.scopes
        self._access_tokens[new_access] = AccessToken(
            token=new_access,
            client_id=client.client_id or "",
            scopes=effective_scopes,
            expires_at=int(time.time()) + SESSION_TTL,
            claims={"email": email},
        )

        new_refresh = secrets.token_urlsafe(32)
        self._refresh_tokens[new_refresh] = RefreshToken(
            token=new_refresh,
            client_id=client.client_id or "",
            scopes=effective_scopes,
        )
        self._refresh_emails[new_refresh] = email

        return OAuthToken(
            access_token=new_access,
            token_type="Bearer",
            expires_in=SESSION_TTL,
            refresh_token=new_refresh,
        )

    # -- revocation ------------------------------------------------------------

    async def revoke_token(self, token: AccessToken | RefreshToken) -> None:
        if isinstance(token, AccessToken):
            self._access_tokens.pop(token.token, None)
        elif isinstance(token, RefreshToken):
            self._refresh_tokens.pop(token.token, None)
            self._refresh_emails.pop(token.token, None)
