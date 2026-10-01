# Opens Blender with the "MCP for Blender" server already listening on localhost:9876,
# so a Claude session in ~/claude-office can drive this window live.
#   open -na Blender --args --python assets/blender/start_mcp.py
import bpy


def _start():
    try:
        wm = bpy.context.window_manager
        win = wm.windows[0] if wm.windows else None
        if win is not None:
            with bpy.context.temp_override(window=win, screen=win.screen):
                bpy.ops.blendermcp.start_server()
        else:
            bpy.ops.blendermcp.start_server()
        print("[claude-office] MCP for Blender server started")
        return None
    except Exception as exc:  # UI not ready yet: try again shortly
        print("[claude-office] waiting to start MCP server:", exc)
        return 2.0


bpy.app.timers.register(_start, first_interval=1.5)
