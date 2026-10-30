from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

router = APIRouter(prefix="/chat", tags=["Chat"])

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    # Eventueel chat history toevoegen als je multi-turn wilt:
    # history: list[dict] = Field(default_factory=list)

class ChatResponse(BaseModel):
    reply: str


@router.post("", response_model=ChatResponse)
async def send_chat_message(payload: ChatRequest, request: Request) -> ChatResponse:
    container = request.app.state.container
    
    # Roep het model aan via de container
    # Let op: als generate_reply synchroon/CPU/GPU-intensief is, 
    # draai het in een threadpool zodat FastAPI niet bevriest:
    import asyncio
    reply = await asyncio.to_thread(container.generate_reply, payload.message)
    
    return ChatResponse(reply=reply)