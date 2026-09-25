import datetime
import json
import time
import typing as t
from pathlib import Path

from fastapi import FastAPI, Request, Form, Cookie, Depends, HTTPException
from fastapi.responses import RedirectResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import starlette.status as status
from outline_vpn.outline_vpn import OutlineVPN
import requests
import uvicorn


app = FastAPI(title="Outline Web Manager", version="2.0.0")

app.mount("/static", StaticFiles(directory="static"), name="static")

templates = Jinja2Templates(directory="templates")


def parse_and_validate_outline_credentials(raw_json: str) -> t.Tuple[t.Optional[OutlineVPN], t.Optional[dict], t.Optional[float], t.Optional[str]]:
    """
    Validates Outline server credentials and attempts connection with latency benchmarking.
    Returns: (client, server_info, latency_ms, error_message)
    """
    if not raw_json or not raw_json.strip():
        return None, None, None, "Credentials string is empty."

    try:
        parsed = json.loads(raw_json.strip())
    except json.JSONDecodeError as err:
        return None, None, None, f"Invalid JSON format: {err.msg}. Please paste the raw output from the Outline installation script."

    if not isinstance(parsed, dict):
        return None, None, None, "Invalid JSON structure. Expected a JSON object with 'apiUrl' and 'certSha256'."

    api_url = parsed.get("apiUrl")
    cert_sha256 = parsed.get("certSha256")

    if not api_url or not cert_sha256:
        return None, None, None, "Missing 'apiUrl' or 'certSha256' in the provided credentials."

    start_time = time.perf_counter()
    try:
        client = OutlineVPN(api_url=api_url, cert_sha256=cert_sha256)
        server_info = client.get_server_information()
        latency_ms = round((time.perf_counter() - start_time) * 1000, 1)
        return client, server_info, latency_ms, None
    except requests.exceptions.ConnectTimeout:
        return None, None, None, f"Connection timed out. The Outline server port in '{api_url}' is not responding or blocked by a firewall."
    except requests.exceptions.SSLError as ssl_err:
        return None, None, None, f"SSL verification failed. The provided certSha256 does not match the server certificate ({ssl_err})."
    except requests.exceptions.ConnectionError:
        return None, None, None, f"Connection refused. Please verify the host IP and port are reachable from this machine."
    except Exception as exc:
        return None, None, None, f"Could not connect to Outline server: {str(exc)}"


async def get_outline_client(
    request: Request,
    outputJsonCookie: t.Union[str, None] = Cookie(default=None),
    outputJsonForm: t.Union[str, None] = Form(default=None),
) -> t.Optional[OutlineVPN]:
    credentials = outputJsonCookie or outputJsonForm
    if not credentials:
        return None

    client, _, _, _ = parse_and_validate_outline_credentials(credentials)
    return client


# --------------------------------------------------------------------------
# Main View & Authentication Routes
# --------------------------------------------------------------------------

@app.get("/")
async def root(request: Request, outline_client: OutlineVPN = Depends(get_outline_client)):
    if not outline_client:
        return templates.TemplateResponse("landing.html", {"request": request})

    try:
        transferred_data = outline_client.get_transferred_data()
        total_month_usage = sum(transferred_data.get('bytesTransferredByUserId', {}).values())
        server_information = outline_client.get_server_information()
        keys = outline_client.get_keys()
    except Exception:
        # If server becomes unreachable, prompt re-sign in
        response = templates.TemplateResponse("sign-in.html", {
            "request": request,
            "error_message": "Session expired or Outline server is temporarily unreachable."
        })
        response.delete_cookie('outputJsonCookie')
        return response

    data = {
        'request': request,
        'server_information': server_information,
        'server_creation': datetime.datetime.fromtimestamp(server_information['createdTimestampMs'] // 1000),
        'total_month_usage': total_month_usage,
        'keys': keys,
    }

    return templates.TemplateResponse("main.html", data)


@app.get("/login")
@app.get("/sign-in")
async def sign_in_view(request: Request, outline_client: OutlineVPN = Depends(get_outline_client)):
    if outline_client:
        return RedirectResponse('/', status_code=status.HTTP_302_FOUND)
    return templates.TemplateResponse("sign-in.html", {"request": request})


@app.get("/landing")
@app.get("/about")
async def landing_view(request: Request):
    return templates.TemplateResponse("landing.html", {"request": request})


@app.post("/sign-in")
async def sign_in(
    request: Request,
    outputJsonForm: str = Form(""),
):
    is_ajax = (
        request.headers.get("x-requested-with") == "XMLHttpRequest"
        or "application/json" in request.headers.get("accept", "")
    )

    client, server_info, latency_ms, error = parse_and_validate_outline_credentials(outputJsonForm)

    if error:
        if is_ajax:
            return JSONResponse(status_code=400, content={"status": "error", "message": error})
        return templates.TemplateResponse("sign-in.html", {
            "request": request,
            "error_message": error,
            "prefill_value": outputJsonForm
        })

    expires = datetime.datetime.utcnow() + datetime.timedelta(days=90)

    if is_ajax:
        response = JSONResponse(content={
            "status": "ok",
            "redirect": "/",
            "server_name": server_info.get("name", "Outline Server"),
            "latency_ms": latency_ms
        })
    else:
        response = RedirectResponse('/', status_code=status.HTTP_302_FOUND)

    response.set_cookie(
        key='outputJsonCookie',
        value=outputJsonForm.strip(),
        expires=expires.strftime("%a, %d %b %Y %H:%M:%S GMT"),
        httponly=True,
        samesite="lax",
    )
    return response


@app.post("/logout")
async def logout():
    response = RedirectResponse('/', status_code=status.HTTP_302_FOUND)
    response.delete_cookie('outputJsonCookie')
    return response


# --------------------------------------------------------------------------
# Client 1-Click Invite Landing Page
# --------------------------------------------------------------------------

@app.get("/invite/{key_id}")
async def client_invite_page(
    request: Request,
    key_id: str,
    outline_client: OutlineVPN = Depends(get_outline_client)
):
    if not outline_client:
        return RedirectResponse('/')

    try:
        keys = outline_client.get_keys()
        target_key = next((k for k in keys if str(k.key_id) == str(key_id)), None)
        if not target_key:
            raise HTTPException(status_code=404, detail="Access Key not found on this server.")

        server_info = outline_client.get_server_information()
        return templates.TemplateResponse("invite.html", {
            "request": request,
            "key": target_key,
            "server_information": server_info,
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --------------------------------------------------------------------------
# Real-Time Monitoring & REST API Endpoints (AJAX / No-Reload)
# --------------------------------------------------------------------------

@app.get("/api/ping")
async def ping_server(outline_client: OutlineVPN = Depends(get_outline_client)):
    if not outline_client:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Not authenticated"})

    start = time.perf_counter()
    try:
        outline_client.get_server_information()
        latency_ms = round((time.perf_counter() - start) * 1000, 1)
        return {"status": "ok", "latency_ms": latency_ms}
    except Exception as err:
        return JSONResponse(status_code=502, content={"status": "error", "message": str(err)})


@app.get("/api/stats")
async def get_live_stats(outline_client: OutlineVPN = Depends(get_outline_client)):
    if not outline_client:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Not authenticated"})

    try:
        server_info = outline_client.get_server_information()
        transferred_data = outline_client.get_transferred_data()
        total_month_usage = sum(transferred_data.get('bytesTransferredByUserId', {}).values())
        keys = outline_client.get_keys()

        serialized_keys = []
        for k in keys:
            serialized_keys.append({
                "key_id": str(k.key_id),
                "name": k.name,
                "used_bytes": k.used_bytes or 0,
                "data_limit": k.data_limit,
                "access_url": k.access_url,
            })

        return {
            "status": "ok",
            "server_information": server_info,
            "total_month_usage": total_month_usage,
            "keys": serialized_keys,
            "active_keys_count": len(keys),
        }
    except Exception as err:
        return JSONResponse(status_code=500, content={"status": "error", "message": str(err)})


@app.post("/api/keys/add")
async def api_create_new_key(
    request: Request,
    newKeyName: str = Form(""),
    outline_client: OutlineVPN = Depends(get_outline_client),
):
    if not outline_client:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Not authenticated"})

    try:
        new_key = outline_client.create_key(newKeyName.strip() or None)
        return {
            "status": "ok",
            "key": {
                "key_id": str(new_key.key_id),
                "name": new_key.name,
                "used_bytes": new_key.used_bytes or 0,
                "data_limit": new_key.data_limit,
                "access_url": new_key.access_url,
            }
        }
    except Exception as err:
        return JSONResponse(status_code=500, content={"status": "error", "message": str(err)})


@app.post("/api/keys/{key_id}/rename")
async def api_rename_key(
    key_id: str,
    keyName: str = Form(""),
    outline_client: OutlineVPN = Depends(get_outline_client),
):
    if not outline_client:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Not authenticated"})

    try:
        outline_client.rename_key(key_id, keyName.strip())
        return {"status": "ok", "key_id": key_id, "name": keyName.strip()}
    except Exception as err:
        return JSONResponse(status_code=500, content={"status": "error", "message": str(err)})


@app.post("/api/keys/{key_id}/delete")
async def api_delete_key(
    key_id: str,
    outline_client: OutlineVPN = Depends(get_outline_client),
):
    if not outline_client:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Not authenticated"})

    try:
        outline_client.delete_key(key_id)
        return {"status": "ok", "key_id": key_id}
    except Exception as err:
        return JSONResponse(status_code=500, content={"status": "error", "message": str(err)})


@app.post("/api/keys/{key_id}/limit")
async def api_set_key_limit(
    key_id: str,
    dataLimit: float = Form(...),
    outline_client: OutlineVPN = Depends(get_outline_client),
):
    if not outline_client:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Not authenticated"})

    try:
        bytes_val = int(dataLimit * 1000 * 1000 * 1000)
        outline_client.add_data_limit(key_id, bytes_val)
        return {"status": "ok", "key_id": key_id, "limit_bytes": bytes_val, "limit_gb": dataLimit}
    except Exception as err:
        return JSONResponse(status_code=500, content={"status": "error", "message": str(err)})


@app.post("/api/keys/{key_id}/delete-limit")
async def api_delete_key_limit(
    key_id: str,
    outline_client: OutlineVPN = Depends(get_outline_client),
):
    if not outline_client:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Not authenticated"})

    try:
        outline_client.delete_data_limit(key_id)
        return {"status": "ok", "key_id": key_id}
    except Exception as err:
        return JSONResponse(status_code=500, content={"status": "error", "message": str(err)})


@app.post("/api/keys/{key_id}/toggle-pause")
async def api_toggle_pause_key(
    key_id: str,
    outline_client: OutlineVPN = Depends(get_outline_client),
):
    """
    Toggles pause for an access key.
    Pausing sets the key's limit to 1 byte (traffic blocked).
    Unpausing removes the restriction.
    """
    if not outline_client:
        return JSONResponse(status_code=401, content={"status": "error", "message": "Not authenticated"})

    try:
        keys = outline_client.get_keys()
        target = next((k for k in keys if str(k.key_id) == str(key_id)), None)
        if not target:
            return JSONResponse(status_code=404, content={"status": "error", "message": "Key not found"})

        # If limit is 1 byte, it is currently paused
        is_paused = target.data_limit == 1
        if is_paused:
            outline_client.delete_data_limit(key_id)
            return {"status": "ok", "key_id": key_id, "paused": False}
        else:
            outline_client.add_data_limit(key_id, 1)
            return {"status": "ok", "key_id": key_id, "paused": True}
    except Exception as err:
        return JSONResponse(status_code=500, content={"status": "error", "message": str(err)})


# --------------------------------------------------------------------------
# Legacy HTML Form Compatibility Handlers
# --------------------------------------------------------------------------

@app.post("/add")
async def create_new_key(
    newKeyName: str = Form(),
    outline_client: OutlineVPN = Depends(get_outline_client),
):
    if outline_client:
        outline_client.create_key(newKeyName)
    return RedirectResponse('/', status_code=status.HTTP_302_FOUND)


@app.post("/rename/{key_id}")
async def rename_key_name(
    key_id: str,
    keyName: str = Form(),
    outline_client: OutlineVPN = Depends(get_outline_client),
):
    if outline_client:
        outline_client.rename_key(key_id, keyName)
    return RedirectResponse('/', status_code=status.HTTP_302_FOUND)


@app.post("/delete/{key_id}")
async def delete_key(
    key_id: str,
    outline_client: OutlineVPN = Depends(get_outline_client),
):
    if outline_client:
        outline_client.delete_key(key_id)
    return RedirectResponse('/', status_code=status.HTTP_302_FOUND)


@app.post("/set-server-name")
async def set_server_name(
    serverName: str = Form(),
    outline_client: OutlineVPN = Depends(get_outline_client),
):
    if outline_client:
        outline_client.set_server_name(serverName)
    return RedirectResponse('/', status_code=status.HTTP_302_FOUND)


@app.post("/set-hostname")
async def set_hostname(
    hostnameForAccessKeys: str = Form(),
    outline_client: OutlineVPN = Depends(get_outline_client),
):
    if outline_client:
        outline_client.set_hostname(hostnameForAccessKeys)
    return RedirectResponse('/', status_code=status.HTTP_302_FOUND)


@app.post("/set-metrics")
async def set_metrics(
    metrics: bool = Form(),
    outline_client: OutlineVPN = Depends(get_outline_client),
):
    if outline_client:
        outline_client.set_metrics_status(metrics)
    return RedirectResponse('/', status_code=status.HTTP_302_FOUND)


@app.post("/set-port")
async def set_port(
    portForNewAccessKeys: int = Form(),
    outline_client: OutlineVPN = Depends(get_outline_client),
):
    if outline_client:
        outline_client.set_port_new_for_access_keys(portForNewAccessKeys)
    return RedirectResponse('/', status_code=status.HTTP_302_FOUND)


@app.post("/set-data-limit")
async def set_data_limit(
    dataLimitForAllKeys: int = Form(),
    outline_client: OutlineVPN = Depends(get_outline_client),
):
    if outline_client:
        outline_client.set_data_limit_for_all_keys(dataLimitForAllKeys * 1000 * 1000 * 1000)
    return RedirectResponse('/', status_code=status.HTTP_302_FOUND)


@app.post("/delete-data-limit")
async def delete_data_limit(
    outline_client: OutlineVPN = Depends(get_outline_client),
):
    if outline_client:
        outline_client.delete_data_limit_for_all_keys()
    return RedirectResponse('/', status_code=status.HTTP_302_FOUND)


@app.post("/set-data-limit/{key_id}")
async def set_key_data_limit(
    key_id: str,
    dataLimit: int = Form(),
    outline_client: OutlineVPN = Depends(get_outline_client),
):
    if outline_client:
        outline_client.add_data_limit(key_id, dataLimit * 1000 * 1000 * 1000)
    return RedirectResponse('/', status_code=status.HTTP_302_FOUND)


@app.post("/delete-data-limit/{key_id}")
async def delete_key_data_limit(
    key_id: str,
    outline_client: OutlineVPN = Depends(get_outline_client),
):
    if outline_client:
        outline_client.delete_data_limit(key_id)
    return RedirectResponse('/', status_code=status.HTTP_302_FOUND)


# --------------------------------------------------------------------------
# PWA & Service Worker Endpoints
# --------------------------------------------------------------------------

@app.get("/manifest.json")
async def manifest_json():
    manifest_path = Path("static/manifest.json")
    if manifest_path.exists():
        return FileResponse(manifest_path, media_type="application/manifest+json")
    return JSONResponse(status_code=404, content={"error": "manifest.json not found"})


@app.get("/sw.js")
async def service_worker_js():
    sw_path = Path("static/sw.js")
    if sw_path.exists():
        return FileResponse(sw_path, media_type="application/javascript")
    return JSONResponse(status_code=404, content={"error": "sw.js not found"})


@app.get("/version")
async def version():
    return {"version": "2.0.0", "status": "healthy"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
