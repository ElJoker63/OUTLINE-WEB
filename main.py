from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from dotenv import load_dotenv
import httpx
import os
import ssl
import requests

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")
load_dotenv()

@app.get("/")
async def get_server_info(request: Request):
    server_url = 'https://152.206.119.39:36655/kGDWn6G7126lUO6WPKi-eQ'
    response = requests.get(f"{server_url}/access-keys", verify=False)
    keys = response.json()
    #return keys
    return templates.TemplateResponse("server_info.html", {"request": request, "keys": keys})

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
