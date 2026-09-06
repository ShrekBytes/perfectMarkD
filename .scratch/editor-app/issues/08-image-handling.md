# 08 — Image handling (paste, drop, picker)

Status: claimed
Blocked by: editor-app/02, editor-app/03

Images are local assets, never uploaded (privacy posture): paste from clipboard, drag-drop onto editor, or picker → Blob in IndexedDB asset store → markdown ref inserted as `![alt](asset://<id>)`. `AssetResolver` maps refs to blob URLs for preview and to data: URIs for Client Export HTML. Image Inspector affordance: clicking an image in the canvas shows alt/width controls (optional, cheap). Refuse >20 MB single assets with a clear message. Store media type; svg allowed.

**Accepts**: paste/drop/picker round-trip; images survive reload; export HTML embeds them (data:); oversized rejected gracefully.
