# Model claims

One file per model id, containing the owning artist's name. **Before writing or editing
`assets/blender/<category>/<id>.py`, read `assets/claims/<id>`:**

- It names you → go ahead.
- It names someone else → don't touch the id; tell the orchestrator if you think it's wrong.
- It doesn't exist → claim it atomically first, then write:
  `python3 -c "open('assets/claims/<id>','x').write('<Your Name>\n')"` (fails if someone beat you to it).

Re-check the claim immediately before each write, never as a batch beforehand.
