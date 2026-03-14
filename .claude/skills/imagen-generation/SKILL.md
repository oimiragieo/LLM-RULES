---
name: imagen-generation
description: Google Imagen image generation via Vertex AI — text-to-image, image editing, inpainting, and upscaling using ImageGenerationModel
version: 1.0.0
category: ai-ml
tools:
  - Bash
  - Write
  - Read
---

# Imagen Generation Skill

## When to Invoke

```javascript
Skill({ skill: 'imagen-generation' });
```

Use when:

- Generating images from text prompts via Google Imagen on Vertex AI
- Editing existing images with text instructions (image-to-image)
- Inpainting / outpainting specific regions of an image
- Upscaling images using Imagen upscaler
- Integrating AI image generation into Python workflows

---

## Setup

### Prerequisites

```bash
pip install google-cloud-aiplatform pillow
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID
```

### Enable Vertex AI

```bash
gcloud services enable aiplatform.googleapis.com
```

### Authentication

```python
import vertexai
from vertexai.preview.vision_models import ImageGenerationModel

vertexai.init(project='YOUR_PROJECT_ID', location='us-central1')
```

---

## Text-to-Image Generation

```python
import vertexai
from vertexai.preview.vision_models import ImageGenerationModel
from PIL import Image
import io

vertexai.init(project='YOUR_PROJECT_ID', location='us-central1')

model = ImageGenerationModel.from_pretrained('imagegeneration@006')

# Basic generation
response = model.generate_images(
    prompt='A futuristic city skyline at sunset, photorealistic, 4K',
    number_of_images=1,
    aspect_ratio='1:1',        # '1:1', '9:16', '16:9', '3:4', '4:3'
    guidance_scale=7.5,        # 1-20; higher = closer to prompt
    seed=42,                   # Optional: for reproducibility
)

# Save the image
image = response.images[0]
image.save('output.png')

# Or convert to PIL
pil_image = Image.open(io.BytesIO(image._image_bytes))
pil_image.show()
```

---

## Batch Generation

```python
prompts = [
    'A serene mountain lake at dawn',
    'Abstract digital art with geometric shapes',
    'A cozy coffee shop interior',
]

for i, prompt in enumerate(prompts):
    response = model.generate_images(
        prompt=prompt,
        number_of_images=1,
    )
    response.images[0].save(f'image_{i}.png')
    print(f'Saved image_{i}.png for: {prompt[:50]}')
```

---

## Image Editing (Image-to-Image)

```python
from vertexai.preview.vision_models import ImageGenerationModel, Image as VertexImage

model = ImageGenerationModel.from_pretrained('imagegeneration@006')

# Load source image
source_image = VertexImage.load_from_file('source.png')

response = model.edit_image(
    base_image=source_image,
    prompt='Make the sky more dramatic with storm clouds',
    edit_mode='inpainting-insert',   # 'inpainting-insert' | 'inpainting-remove' | 'outpainting'
    mask_mode='background',           # 'background' | 'foreground' | 'semantic'
    number_of_images=1,
    guidance_scale=8.0,
)

response.images[0].save('edited.png')
```

---

## Inpainting with Mask

```python
import numpy as np
from PIL import Image, ImageDraw

# Create a mask (white = area to inpaint, black = keep)
source_pil = Image.open('source.png')
mask = Image.new('L', source_pil.size, 0)  # Black background
draw = ImageDraw.Draw(mask)
draw.rectangle([100, 100, 300, 300], fill=255)  # White region to replace
mask.save('mask.png')

# Load for Vertex AI
source_image = VertexImage.load_from_file('source.png')
mask_image = VertexImage.load_from_file('mask.png')

response = model.edit_image(
    base_image=source_image,
    mask=mask_image,
    prompt='A beautiful garden fountain',
    edit_mode='inpainting-insert',
    number_of_images=1,
)
response.images[0].save('inpainted.png')
```

---

## Upscaling

```python
from vertexai.preview.vision_models import ImageGenerationModel, Image as VertexImage

model = ImageGenerationModel.from_pretrained('imagegeneration@006')
source_image = VertexImage.load_from_file('low_res.png')

response = model.upscale_image(
    image=source_image,
    upscale_factor='x2',   # 'x2' or 'x4'
)
response.save('upscaled.png')
```

---

## Negative Prompts

Use negative prompts to exclude unwanted elements:

```python
response = model.generate_images(
    prompt='Portrait of a professional business person in an office',
    negative_prompt='blurry, low quality, cartoon, anime, watermark, text, logo',
    number_of_images=2,
    guidance_scale=9.0,
)
for i, img in enumerate(response.images):
    img.save(f'portrait_{i}.png')
```

---

## Imagen 3 (Latest Model)

```python
# Imagen 3 — highest quality, best prompt adherence
model = ImageGenerationModel.from_pretrained('imagen-3.0-generate-001')

response = model.generate_images(
    prompt='A photorealistic macro photograph of a dewdrop on a spider web at sunrise',
    number_of_images=1,
    aspect_ratio='3:4',
    safety_filter_level='block_some',  # 'block_most' | 'block_some' | 'block_few'
    person_generation='allow_adult',   # 'dont_allow' | 'allow_adult'
)
response.images[0].save('imagen3_output.png')
```

---

## Model Reference

| Model ID                       | Use Case                       | Notes                      |
| ------------------------------ | ------------------------------ | -------------------------- |
| `imagen-3.0-generate-001`      | Highest quality generation     | Latest, best prompt follow |
| `imagen-3.0-fast-generate-001` | Fast/cost-effective generation | Lower latency              |
| `imagegeneration@006`          | Stable production model        | Well-tested                |
| `imagegeneration@005`          | Previous generation            | Legacy                     |
| `imagen-3.0-capability-001`    | Editing and transformations    | Inpaint, outpaint          |

---

## Hugging Face Alternative (No GCP Required)

For local or non-GCP environments, use Stable Diffusion via `diffusers`:

```bash
pip install diffusers transformers accelerate torch
```

```python
from diffusers import StableDiffusionPipeline
import torch

pipe = StableDiffusionPipeline.from_pretrained(
    'runwayml/stable-diffusion-v1-5',
    torch_dtype=torch.float16,
)
pipe = pipe.to('cuda')  # or 'cpu' (slow)

image = pipe(
    prompt='A futuristic city at sunset',
    negative_prompt='blurry, low quality',
    num_inference_steps=30,
    guidance_scale=7.5,
).images[0]

image.save('output.png')
```

---

## Cost Optimization

- Use `imagen-3.0-fast-generate-001` for iteration/drafts; switch to `imagen-3.0-generate-001` for final output
- Generate 1-2 images per call during development; batch only in production
- Cache results when the same prompt is used repeatedly
- Use `seed` for reproducibility to avoid regenerating identical images
- Vertex AI pricing: check `cloud.google.com/vertex-ai/pricing` (billed per image)

---

## Safety and Content Policy

- Imagen enforces Google's content policy; explicit/harmful content requests are blocked
- `safety_filter_level` controls strictness: `block_most` (safest) → `block_few` (permissive)
- `person_generation='dont_allow'` disables human face generation for child-safety compliance
- Store `generation_parameters` from response for audit/reproducibility requirements
- Never generate images of real people without appropriate consent handling
