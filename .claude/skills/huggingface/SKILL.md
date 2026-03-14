---
name: huggingface
description: Hugging Face Hub operations, model inference, dataset management, PEFT/LoRA fine-tuning, and Spaces deployment via MCP tools and Python APIs
version: 1.0.0
model: sonnet
invoked_by: both
user_invocable: true
tools:
  - Read
  - Write
  - Bash
  - WebFetch
  - Skill
agents:
  - developer
  - python-pro
  - researcher
category: External Integrations
tags:
  - huggingface
  - llm
  - ml
  - transformers
  - datasets
  - inference
  - fine-tuning
  - peft
  - lora
  - spaces
---

# Hugging Face Skill

## Purpose

Provides structured workflows for interacting with the Hugging Face ecosystem: Hub repository search, model loading and inference, dataset management, PEFT/LoRA fine-tuning, and Spaces deployment. Integrates via MCP tools when available and falls back to Python APIs and the `huggingface_hub` CLI.

## When to Invoke

```javascript
Skill({ skill: 'huggingface' });
```

Invoke when:

- Searching for models, datasets, or Spaces on the Hub
- Loading and running inference with Transformers models
- Managing datasets with the `datasets` library
- Fine-tuning models with PEFT/LoRA
- Deploying or querying Hugging Face Spaces
- Selecting the right model for a task (NLP, vision, audio, multimodal)

---

## MCP Tool Integration

When the Hugging Face MCP server is available, prefer MCP tools over direct API calls.

### Hub Search

**Search for models by task or keyword:**

```javascript
// Search models
mcp__claude_ai_Hugging_Face__hub_repo_search({
  query: 'text-classification',
  repo_type: 'model',
  limit: 10,
});

// Get detailed repo info
mcp__claude_ai_Hugging_Face__hub_repo_details({
  repo_id: 'bert-base-uncased',
  repo_type: 'model',
});
```

**Expected output:** JSON list of repos with `modelId`, `downloads`, `likes`, `tags`, `pipeline_tag`, and `lastModified`.

**Verify:** Confirm `pipeline_tag` matches the intended task before proceeding.

### Paper and Space Search

```javascript
// Search arXiv papers on the Hub
mcp__claude_ai_Hugging_Face__paper_search({
  query: 'instruction tuning language models',
  limit: 5,
});

// Search Spaces
mcp__claude_ai_Hugging_Face__space_search({
  query: 'stable diffusion',
  limit: 5,
});
```

### Documentation Search

```javascript
// Search HF docs
mcp__claude_ai_Hugging_Face__hf_doc_search({
  query: 'AutoModelForCausalLM from_pretrained',
  library: 'transformers',
});
```

---

## Model Loading & Inference

### Standard Transformers Pipeline

```python
from transformers import pipeline

# Text generation
generator = pipeline(
    "text-generation",
    model="meta-llama/Llama-3.2-1B-Instruct",
    device_map="auto",
    torch_dtype="auto",
)
result = generator("What is the capital of France?", max_new_tokens=100)
print(result[0]["generated_text"])
```

**Verify:** `result[0]["generated_text"]` contains coherent continuation. Check `device_map` resolves to GPU if available.

### AutoModel Pattern (Explicit Control)

```python
from transformers import AutoTokenizer, AutoModelForCausalLM
import torch

model_id = "microsoft/Phi-3-mini-4k-instruct"
tokenizer = AutoTokenizer.from_pretrained(model_id)
model = AutoModelForCausalLM.from_pretrained(
    model_id,
    torch_dtype=torch.bfloat16,
    device_map="auto",
    attn_implementation="flash_attention_2",  # if available
)

inputs = tokenizer("Hello, world!", return_tensors="pt").to(model.device)
with torch.no_grad():
    outputs = model.generate(**inputs, max_new_tokens=50)
print(tokenizer.decode(outputs[0], skip_special_tokens=True))
```

### Inference API (Serverless)

```python
from huggingface_hub import InferenceClient

client = InferenceClient(token="hf_...")  # or use HF_TOKEN env var

# Text generation
result = client.text_generation(
    "Tell me a joke",
    model="mistralai/Mistral-7B-Instruct-v0.3",
    max_new_tokens=200,
)
print(result)

# Chat completion (OpenAI-compatible)
response = client.chat_completion(
    model="meta-llama/Llama-3.1-8B-Instruct",
    messages=[{"role": "user", "content": "Explain quantum entanglement"}],
    max_tokens=300,
)
print(response.choices[0].message.content)
```

**Verify:** Check `response.choices[0].finish_reason == "stop"` for complete generation.

---

## Dataset Management

### Loading Datasets

```python
from datasets import load_dataset

# Public dataset
ds = load_dataset("squad", split="train")
print(ds.column_names)  # ['id', 'title', 'context', 'question', 'answers']

# With streaming (large datasets)
ds_stream = load_dataset("allenai/c4", "en", split="train", streaming=True)
sample = next(iter(ds_stream))

# From Hub with specific config
ds = load_dataset("glue", "mrpc", split={"train": "train", "val": "validation"})
```

**Verify:** `len(ds)` returns expected row count. `ds.features` shows correct schema.

### Creating and Pushing Datasets

```python
from datasets import Dataset, DatasetDict
from huggingface_hub import HfApi

# Create from dict
data = {"text": ["Hello", "World"], "label": [0, 1]}
ds = Dataset.from_dict(data)

# Push to Hub
ds.push_to_hub("username/my-dataset", private=True, token="hf_...")

# Verify upload
api = HfApi()
info = api.dataset_info("username/my-dataset")
print(f"Rows: {info.cardData.get('dataset_info', {}).get('splits', {})}")
```

### Dataset Preprocessing

```python
from datasets import load_dataset
from transformers import AutoTokenizer

ds = load_dataset("imdb", split="train")
tokenizer = AutoTokenizer.from_pretrained("distilbert-base-uncased")

def tokenize(batch):
    return tokenizer(batch["text"], truncation=True, padding="max_length", max_length=512)

ds_tokenized = ds.map(tokenize, batched=True, remove_columns=["text"])
ds_tokenized.set_format(type="torch", columns=["input_ids", "attention_mask", "label"])
```

---

## PEFT / LoRA Fine-Tuning

### LoRA Configuration

```python
from peft import LoraConfig, get_peft_model, TaskType

lora_config = LoraConfig(
    r=16,                          # rank — higher = more parameters
    lora_alpha=32,                 # scaling factor
    target_modules=["q_proj", "v_proj"],  # layers to apply LoRA to
    lora_dropout=0.05,
    bias="none",
    task_type=TaskType.CAUSAL_LM,
)

model = get_peft_model(model, lora_config)
model.print_trainable_parameters()
# Expected: trainable params: ~X MB / total: ~Y GB (<1% of total)
```

### QLoRA (4-bit Quantized LoRA)

```python
from transformers import BitsAndBytesConfig, AutoModelForCausalLM
from peft import prepare_model_for_kbit_training

bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype="bfloat16",
    bnb_4bit_use_double_quant=True,
)

model = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-3.1-8B",
    quantization_config=bnb_config,
    device_map="auto",
)
model = prepare_model_for_kbit_training(model)
```

### SFT with TRL

```python
from trl import SFTTrainer, SFTConfig
from datasets import load_dataset

dataset = load_dataset("timdettmers/openassistant-guanaco", split="train")

training_args = SFTConfig(
    output_dir="./sft-output",
    num_train_epochs=3,
    per_device_train_batch_size=4,
    gradient_accumulation_steps=4,
    learning_rate=2e-4,
    fp16=True,
    logging_steps=10,
    save_strategy="epoch",
    push_to_hub=True,
    hub_model_id="username/my-finetuned-model",
)

trainer = SFTTrainer(
    model=model,
    args=training_args,
    train_dataset=dataset,
    peft_config=lora_config,
    dataset_text_field="text",
)
trainer.train()
trainer.push_to_hub()
```

**Verify:** Loss decreases from epoch 1 to 3. `trainer.state.log_history[-1]["train_loss"]` should be < initial loss.

### Merging Adapters

```python
from peft import PeftModel

# Load base + adapter
base_model = AutoModelForCausalLM.from_pretrained("meta-llama/Llama-3.1-8B")
model = PeftModel.from_pretrained(base_model, "username/my-lora-adapter")

# Merge and unload (creates standalone model)
merged = model.merge_and_unload()
merged.save_pretrained("./merged-model")
```

---

## Spaces Deployment

### Gradio Space

```python
# app.py for a Gradio Space
import gradio as gr
from transformers import pipeline

pipe = pipeline("text-classification", model="distilbert-base-uncased-finetuned-sst-2-english")

def classify(text):
    result = pipe(text)[0]
    return f"{result['label']}: {result['score']:.3f}"

demo = gr.Interface(fn=classify, inputs="text", outputs="text", title="Sentiment Classifier")
demo.launch()
```

**requirements.txt:**

```
transformers>=4.40.0
torch>=2.2.0
gradio>=4.0.0
```

### Querying Existing Spaces

```python
from gradio_client import Client

client = Client("hf-audio/whisper-large-v3")
result = client.predict(
    audio="path/to/audio.wav",
    api_name="/predict",
)
print(result)
```

### Deploying via API

```python
from huggingface_hub import HfApi

api = HfApi(token="hf_...")

# Create Space
api.create_repo(
    repo_id="username/my-space",
    repo_type="space",
    space_sdk="gradio",
    private=False,
)

# Upload files
api.upload_folder(
    folder_path="./my-space-app",
    repo_id="username/my-space",
    repo_type="space",
)
```

**Verify:** Space appears at `https://huggingface.co/spaces/username/my-space` and status is `RUNNING`.

---

## Model Selection Guide

### By Task

| Task | Recommended Models | Notes |
|------|--------------------|-------|
| Text generation | `meta-llama/Llama-3.1-8B-Instruct`, `mistralai/Mistral-7B-Instruct-v0.3` | Instruction-tuned for chat |
| Text classification | `distilbert-base-uncased-finetuned-sst-2-english` | Fast, lightweight |
| Token classification (NER) | `dslim/bert-base-NER` | Strong NER baseline |
| Question answering | `deepset/roberta-base-squad2` | SQuAD2 trained |
| Summarization | `facebook/bart-large-cnn` | News summarization |
| Translation | `Helsinki-NLP/opus-mt-{src}-{tgt}` | Replace src/tgt with language codes |
| Embeddings | `sentence-transformers/all-MiniLM-L6-v2` | Fast semantic similarity |
| Image classification | `google/vit-base-patch16-224` | Vision Transformer baseline |
| Object detection | `facebook/detr-resnet-50` | COCO-trained |
| Image generation | `stabilityai/stable-diffusion-xl-base-1.0` | SDXL for high quality |
| ASR (speech-to-text) | `openai/whisper-large-v3` | Best accuracy |
| Text-to-speech | `suno/bark` | Expressive TTS |
| Multimodal (vision+language) | `Qwen/Qwen2-VL-7B-Instruct`, `llava-hf/llava-1.5-7b-hf` | VQA and captioning |

### Selection Criteria

1. **Check downloads and likes** — higher = more community validation
2. **Check `pipeline_tag`** — must match intended task
3. **Check model card** — look for benchmark scores and limitations
4. **Check license** — `apache-2.0` or `mit` for commercial use; `llama` license has restrictions
5. **Check size** — 7B fits on 16GB VRAM with fp16; use 4-bit for smaller GPUs

```bash
# CLI: search by task
huggingface-cli repo search --filter pipeline_tag:text-generation --limit 10
```

---

## Anti-Patterns

- **Never hardcode HF tokens** — use `HF_TOKEN` env var or `huggingface-cli login`
- **Never load full model for inference-only on CPU** — use `device_map="auto"` or Inference API
- **Never skip `attn_implementation`** — for supported models, `flash_attention_2` gives 2-4x speedup
- **Never ignore tokenizer warnings** — padding/truncation mismatches cause silent accuracy drops
- **Never push private data to public repos** — set `private=True` or use `push_to_hub(private=True)`
- **Never use `pipeline()` in production fine-tuning loops** — use `AutoModel` + `Trainer` for control
- **Never merge adapters before evaluation** — evaluate PEFT model first, merge only if satisfactory
- **Never use `model.generate()` without `max_new_tokens`** — unbounded generation hangs

---

## Environment Setup

```bash
# Install core stack
pip install transformers datasets peft trl accelerate bitsandbytes

# Optional: flash attention (Linux + CUDA only)
pip install flash-attn --no-build-isolation

# Login to Hub
huggingface-cli login  # paste HF_TOKEN when prompted

# Verify GPU
python -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0))"
```

---

## Related Skills

- `python-backend-expert` — Python project setup and best practices
- `debugging` — Systematic debugging for training instabilities
- `mcp-catalog` — MCP server selection and configuration

## Memory Protocol

**Before starting any HF task:**

- Check `.claude/context/memory/learnings.md` for prior model selections and known issues
- Check `.claude/context/memory/issues.md` for known HF API rate limits or token issues

**After completing:**

- Record model selection decisions in `.claude/context/memory/decisions.md`
- Record any HF API quirks in `.claude/context/memory/issues.md`
