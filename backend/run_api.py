"""Start de API los van de Node-host: `python run_api.py` (in de map backend)."""

import os

import uvicorn

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="127.0.0.1", port=int(os.environ.get("API_PORT", "8000")))
