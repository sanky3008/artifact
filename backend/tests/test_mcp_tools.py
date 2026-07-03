import mcp_server


def make_file(upload_dir, rel, content="<h1>hi</h1>"):
    p = upload_dir / rel.lstrip("/")
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content)
    return p


class TestEditFile:
    def test_exact_replace(self, upload_dir):
        make_file(upload_dir, "a.html", "<h1>old title</h1><p>body</p>")
        res = mcp_server.edit_file("/a.html", "old title", "new title")
        assert res == {"ok": True, "path": "/a.html", "replacements": 1}
        assert (upload_dir / "a.html").read_text() == "<h1>new title</h1><p>body</p>"

    def test_ambiguous_without_replace_all(self, upload_dir):
        make_file(upload_dir, "a.html", "<p>x</p><p>x</p>")
        res = mcp_server.edit_file("/a.html", "<p>x</p>", "<p>y</p>")
        assert res["error"] == "ambiguous"

    def test_replace_all(self, upload_dir):
        make_file(upload_dir, "a.html", "<p>x</p><p>x</p>")
        res = mcp_server.edit_file("/a.html", "<p>x</p>", "<p>y</p>", replace_all=True)
        assert res["ok"] and res["replacements"] == 2
        assert (upload_dir / "a.html").read_text() == "<p>y</p><p>y</p>"

    def test_old_str_not_found(self, upload_dir):
        make_file(upload_dir, "a.html")
        assert mcp_server.edit_file("/a.html", "nope", "x")["error"] == "not_found_in_file"

    def test_missing_file(self, upload_dir):
        assert mcp_server.edit_file("/nope.html", "a", "b")["error"] == "not_found"

    def test_empty_old_str(self, upload_dir):
        make_file(upload_dir, "a.html")
        assert mcp_server.edit_file("/a.html", "", "x")["error"] == "validation_error"


class TestAppendFile:
    def test_chunked_build(self, upload_dir):
        mcp_server.create_file("/", "big.html", "<html><body>")
        assert mcp_server.append_file("/big.html", "<p>chunk1</p>")["ok"]
        assert mcp_server.append_file("/big.html", "</body></html>")["ok"]
        assert (upload_dir / "big.html").read_text() == "<html><body><p>chunk1</p></body></html>"

    def test_size_cap(self, upload_dir, monkeypatch):
        make_file(upload_dir, "a.html", "x" * 50)
        monkeypatch.setattr(mcp_server, "MAX_FILE_SIZE", 60)
        assert mcp_server.append_file("/a.html", "y" * 20)["error"] == "size_exceeded"

    def test_missing_file(self, upload_dir):
        assert mcp_server.append_file("/nope.html", "x")["error"] == "not_found"


class TestReadFileFromUrl:
    def test_share_link(self, upload_dir):
        make_file(upload_dir, "folder/doc.html", "<h1>shared</h1>")
        res = mcp_server.read_file_from_url("https://artifact.example.com/v/folder/doc.html")
        assert res["content"] == "<h1>shared</h1>"
        assert res["name"] == "doc.html"

    def test_url_encoded_path(self, upload_dir):
        make_file(upload_dir, "my folder/doc.html", "<h1>enc</h1>")
        res = mcp_server.read_file_from_url("https://x.com/v/my%20folder/doc.html")
        assert res["content"] == "<h1>enc</h1>"

    def test_non_share_link_rejected(self, upload_dir):
        assert mcp_server.read_file_from_url("https://x.com/other/doc.html")["error"] == "validation_error"

    def test_traversal_rejected(self, upload_dir):
        res = mcp_server.read_file_from_url("https://x.com/v/../../etc/passwd")
        assert res["error"] in ("invalid_path", "validation_error", "not_found")


class TestResolve:
    def test_sibling_prefix_rejected(self, upload_dir):
        sibling = upload_dir.parent / (upload_dir.name + "x")
        sibling.mkdir(exist_ok=True)
        assert mcp_server.list_files(f"/../{upload_dir.name}x")["error"] == "invalid_path"
