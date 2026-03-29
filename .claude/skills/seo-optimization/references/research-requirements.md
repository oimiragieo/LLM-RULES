# SEO Optimization Research Requirements (2026)

## Verified Tech Stack

- **Analysis**: Lighthouse, PageSpeed Insights
- **Schema**: JSON-LD structured data
- **Tools**: Screaming Frog, Ahrefs, SEMrush APIs

## Key SEO Factors (2026)

### Technical SEO

- Core Web Vitals (LCP, FID, CLS)
- Mobile-first indexing compliance
- HTTPS and security headers
- XML sitemaps and robots.txt

### On-Page SEO

- Title tags (50-60 characters)
- Meta descriptions (150-160 characters)
- H1-H6 hierarchy
- Image alt text
- Internal linking structure

### Structured Data

- JSON-LD format (preferred)
- Schema.org vocabulary
- Rich result eligibility

## Implementation Patterns

### Meta Tags

```html
<title>Descriptive Title | Brand</title>
<meta name="description" content="Compelling description under 160 chars." />
<meta name="robots" content="index, follow" />
```

### Schema Markup

```html
<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "Article Title",
    "author": { "@type": "Person", "name": "Author" }
  }
</script>
```

## Source References

- [Google Search Central](https://developers.google.com/search)
- [Schema.org](https://schema.org/)
- [Web.dev SEO](https://web.dev/learn/seo/)
