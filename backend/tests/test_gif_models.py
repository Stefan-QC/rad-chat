from app.gifs.gif_models import GifItem, GifPage


def test_gif_models__gif_item_defaults() -> None:
    item = GifItem(id="1", preview_url="https://a/p.gif", url="https://a/f.gif")
    assert (item.title, item.width, item.height) == ("", 0, 0)


def test_gif_models__gif_page_next_defaults_to_none() -> None:
    assert GifPage(results=[]).model_dump() == {"results": [], "next": None, "provider": ""}
