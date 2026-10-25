import json

import httpx
import pytest

from app.clients.supabase_storage import CHUNK_SIZE, SupabaseStorage
from app.errors import ApiError
from tests.helpers import SUPABASE_URL, make_settings

URL = f"{SUPABASE_URL}/storage/v1/object/chat-images"
CHANNEL = "a" * 8 + "-aaaa-aaaa-aaaa-" + "a" * 12
USER = "b" * 8 + "-bbbb-bbbb-bbbb-" + "b" * 12


def make_path(index: int = 0, ext: str = "png") -> str:
    return f"{CHANNEL}/{USER}/{index:08x}-0000-0000-0000-000000000000.{ext}"


def make_storage() -> SupabaseStorage:
    return SupabaseStorage(make_settings(), httpx.AsyncClient())


def test_supabase_storage__valid_accepts_the_expected_shape() -> None:
    for ext in ("png", "jpg", "jpeg", "webp", "gif"):
        assert SupabaseStorage._valid(make_path(1, ext))


@pytest.mark.parametrize(
    "path",
    ["", "../etc/passwd", f"{CHANNEL}/{USER}/../x.png", f"{CHANNEL}/x.png", make_path().replace("png", "exe"), make_path() + "/extra", "x/y/z.png"],
)
def test_supabase_storage__valid_rejects_everything_else(path: str) -> None:
    assert not SupabaseStorage._valid(path)


async def test_supabase_storage__remove_sends_prefixes_with_the_service_key(mock_http) -> None:
    route = mock_http.delete(URL).respond(200, json=[{"name": make_path(1)}, {"name": make_path(2)}])
    removed = await make_storage().remove([make_path(1), make_path(2)])
    request = route.calls.last.request
    assert removed == 2
    assert json.loads(request.content) == {"prefixes": [make_path(1), make_path(2)]}
    assert request.headers["authorization"].startswith("Bearer ")


async def test_supabase_storage__remove_skips_invalid_and_duplicate_paths(mock_http) -> None:
    route = mock_http.delete(URL).respond(200, json=[{"name": make_path(1)}])
    await make_storage().remove([make_path(1), make_path(1), "../secret.png", "nope"])
    assert json.loads(route.calls.last.request.content) == {"prefixes": [make_path(1)]}


async def test_supabase_storage__remove_does_nothing_for_an_empty_list(mock_http) -> None:
    route = mock_http.delete(URL).respond(200, json=[])
    assert await make_storage().remove([]) == 0
    assert await make_storage().remove(["nope"]) == 0
    assert route.call_count == 0


async def test_supabase_storage__remove_works_in_chunks(mock_http) -> None:
    route = mock_http.delete(URL).respond(200, json=[])
    await make_storage().remove([make_path(i) for i in range(CHUNK_SIZE + 5)])
    assert route.call_count == 2
    assert len(json.loads(route.calls[0].request.content)["prefixes"]) == CHUNK_SIZE
    assert len(json.loads(route.calls[1].request.content)["prefixes"]) == 5


async def test_supabase_storage__remove_raises_a_generic_error_on_failure(mock_http) -> None:
    mock_http.delete(URL).respond(500, json={"message": "secret internal detail"})
    with pytest.raises(ApiError) as info:
        await make_storage().remove([make_path(1)])
    assert info.value.status_code == 502 and "secret" not in info.value.message
