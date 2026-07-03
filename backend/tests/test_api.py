def make_file(upload_dir, rel, content="<h1>hi</h1>"):
    p = upload_dir / rel.lstrip("/")
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content)
    return p


class TestAuth:
    def test_listing_requires_auth(self, client):
        assert client.get("/api/files").status_code == 401
        assert client.get("/api/tree").status_code == 401

    def test_wrong_password_rejected(self, client):
        res = client.post("/api/auth/login", json={"password": "nope"})
        assert res.status_code == 401

    def test_login_then_list(self, auth_client, upload_dir):
        make_file(upload_dir, "a.html")
        res = auth_client.get("/api/files")
        assert res.status_code == 200
        assert [f["name"] for f in res.json()["files"]] == ["a.html"]

    def test_logout_revokes_session(self, auth_client):
        auth_client.post("/api/auth/logout")
        assert auth_client.get("/api/files").status_code == 401


class TestUpload:
    def test_multi_file_upload_saves_all(self, auth_client, upload_dir):
        res = auth_client.post(
            "/api/files/upload",
            files=[
                ("files", ("a.html", b"<p>a</p>", "text/html")),
                ("files", ("b.html", b"<p>b</p>", "text/html")),
                ("files", ("c.html", b"<p>c</p>", "text/html")),
            ],
        )
        assert res.status_code == 200
        assert res.json()["count"] == 3
        assert sorted(p.name for p in upload_dir.iterdir()) == ["a.html", "b.html", "c.html"]

    def test_upload_requires_auth(self, client):
        res = client.post(
            "/api/files/upload",
            files=[("files", ("a.html", b"x", "text/html"))],
        )
        assert res.status_code == 401

    def test_non_html_skipped(self, auth_client, upload_dir):
        res = auth_client.post(
            "/api/files/upload",
            files=[("files", ("evil.txt", b"x", "text/plain"))],
        )
        assert res.status_code == 200
        assert res.json()["count"] == 0
        assert list(upload_dir.iterdir()) == []


class TestPathTraversal:
    def test_dotdot_rejected(self, auth_client):
        assert auth_client.get("/api/files", params={"path": "/../"}).status_code == 400

    def test_sibling_prefix_rejected(self, auth_client, upload_dir):
        # /uploads must not match /uploadsx via the old startswith() check
        sibling = upload_dir.parent / (upload_dir.name + "x")
        sibling.mkdir(exist_ok=True)
        res = auth_client.get("/api/files", params={"path": f"/../{upload_dir.name}x"})
        assert res.status_code == 400

    def test_catchall_does_not_escape_frontend_dir(self, client):
        res = client.get("/%2e%2e/artifact-test-secret.txt")
        assert "secret-marker" not in res.text


class TestPublicView:
    def test_serves_html_with_csp_sandbox(self, client, upload_dir):
        make_file(upload_dir, "doc.html", "<h1>doc</h1>")
        res = client.get("/v/doc.html")
        assert res.status_code == 200
        assert "doc" in res.text
        assert res.headers["content-security-policy"] == "sandbox allow-scripts"

    def test_nested_path(self, client, upload_dir):
        make_file(upload_dir, "folder/deep.html", "<h1>deep</h1>")
        assert client.get("/v/folder/deep.html").status_code == 200

    def test_missing_file_404(self, client):
        assert client.get("/v/nope.html").status_code == 404

    def test_non_html_404(self, client, upload_dir):
        (upload_dir / "x.txt").write_text("nope")
        assert client.get("/v/x.txt").status_code == 404


class TestMCPBearerAuth:
    RPC = {"jsonrpc": "2.0", "method": "ping", "id": 1}
    ACCEPT = {"Accept": "application/json, text/event-stream"}

    def test_missing_token_401(self, client):
        assert client.post("/mcp", json=self.RPC, headers=self.ACCEPT).status_code == 401

    def test_wrong_token_401(self, client):
        headers = {**self.ACCEPT, "Authorization": "Bearer wrong"}
        assert client.post("/mcp", json=self.RPC, headers=headers).status_code == 401

    def test_valid_token_passes_gate(self, client):
        headers = {**self.ACCEPT, "Authorization": "Bearer test-mcp-token"}
        assert client.post("/mcp", json=self.RPC, headers=headers).status_code != 401
