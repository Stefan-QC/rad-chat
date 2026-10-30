import torch
from transformers import pipeline
from prompts import SYSTEM_PROMPT

# Load the pipeline once on startup
pipe = pipeline(
    "text-generation",
    model="nvidia/NVIDIA-Nemotron-3.5-Bolt-E4B-BF16",
    torch_dtype=torch.bfloat16,
    device_map="auto"
)

def generate_reply(user_message: str, history: list = None) -> str:
    if history is None:
        history = []
    
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(history)
    messages.append({"role": "user", "content": user_message})

    outputs = pipe(
        messages,
        max_new_tokens=256,
        temperature=0.8,
        top_p=0.95,
        do_sample=True,
        pad_token_id=pipe.tokenizer.eos_token_id
    )
    return outputs[0]["generated_text"][-1]["content"]