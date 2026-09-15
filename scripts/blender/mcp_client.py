#!/usr/bin/env python3
"""NX9 对 blender-mcp 插件（localhost:9876）的极简客户端。

用法：
  python mcp_client.py execute_code <python文件路径>
  python mcp_client.py scene_info
  python mcp_client.py screenshot <输出png路径>

协议与 ahujasid/blender-mcp addon 的 socket JSON 一致（type: get_scene_info /
get_viewport_screenshot / execute_code）。
"""
import json
import socket
import sys
import time

HOST = "localhost"
PORT = 9876
TIMEOUT = 300


def send_command(command: dict) -> dict:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(TIMEOUT)
        sock.connect((HOST, PORT))
        sock.sendall(json.dumps(command).encode("utf-8"))
        chunks = []
        while True:
            chunk = sock.recv(65536)
            if not chunk:
                break
            chunks.append(chunk)
            try:
                return json.loads(b"".join(chunks).decode("utf-8"))
            except json.JSONDecodeError:
                time.sleep(0.05)
                continue
    return {"status": "error", "message": "no response"}


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    kind = sys.argv[1]
    if kind == "scene_info":
        resp = send_command({"type": "get_scene_info"})
    elif kind == "screenshot":
        out = sys.argv[2] if len(sys.argv) > 2 else "mcp_screenshot.png"
        resp = send_command({"type": "get_viewport_screenshot", "params": {"filepath": out, "format": "png"}})
    elif kind == "execute_code":
        with open(sys.argv[2], "r", encoding="utf-8") as f:
            code = f.read()
        resp = send_command({"type": "execute_code", "params": {"code": code}})
    else:
        print(f"unknown kind: {kind}")
        return 1
    print(json.dumps(resp, ensure_ascii=False, indent=1)[:8000])
    return 0


if __name__ == "__main__":
    sys.exit(main())
