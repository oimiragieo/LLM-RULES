https://github.com/1Dark134/arxiv-mcp-server/releases

# arxiv-mcp-server: AI MCP for arXiv paper search and exports

[![Release](https://img.shields.io/github/v/release/1Dark134/arxiv-mcp-server?style=for-the-badge)](https://github.com/1Dark134/arxiv-mcp-server/releases)
[![License](https://img.shields.io/github/license/1Dark134/arxiv-mcp-server?style=for-the-badge)](https://github.com/1Dark134/arxiv-mcp-server/blob/main/LICENSE)
[![Build Status](https://img.shields.io/github/actions/workflow/status/1Dark134/arxiv-mcp-server/ci.yml?style=for-the-badge)](https://github.com/1Dark134/arxiv-mcp-server/actions)
[![Repo size](https://img.shields.io/github/repo-size/1Dark134/arxiv-mcp-server?style=for-the-badge)](https://github.com/1Dark134/arxiv-mcp-server)
[![Stars](https://img.shields.io/github/stars/1Dark134/arxiv-mcp-server?style=for-the-badge)](https://github.com/1Dark134/arxiv-mcp-server)

Welcome to arxiv-mcp-server. This project hosts an MCP server for arXiv.org. It helps researchers find papers, analyze citations, track trends, and export data in multiple formats. It blends intelligent discovery with robust data processing so you can focus on research, not data wrangling.

Key ideas you should know:

- It centers on Model Context Protocol (MCP) to coordinate paper data and AI assistants.
- It offers advanced search, discovery, and analysis workflows for academic papers.
- It exports results to several formats for use in other tools.

Topics

- academic-papers
- academic-research
- ai-assistant
- arxiv
- citation-analysis
- mcp
- model-context-protocol
- paper-search
- research-automation
- research-tools

Table of contents

- Overview
- Features
- Quick start
- Installation
- Architecture
- Data model and formats
- How MCP works here
- AI assistants and prompts
- Paper discovery and search
- Citation analysis and trends
- Exports and formats
- API and CLI
- UI and UX
- Docker and deployment
- Security, privacy, and compliance
- Testing and quality
- Development and contribution
- Roadmap
- Releases and versioning
- FAQ
- License and credits

Overview 🚀
arxiv-mcp-server is a scalable server for arXiv.org data. It combines fast search with smart analysis. It uses AI assistants to interpret papers, summarize findings, and propose next steps. The server can export results in BibTeX, RIS, JSON, CSV, and more. It supports multi-format workflows and can power web apps, notebooks, and research dashboards.

This project is built to be reliable in research settings. It favors clarity, reproducibility, and security. It aims to help researchers assemble literature reviews, identify citation patterns, and monitor evolving topics over time.

Features 🧠

- Advanced paper discovery: semantic search, topic modeling, and trend tracking.
- Citation analysis: citation networks, author influence, venue impact, and hot topics.
- AI assistants: guided summaries, question answering, and context-aware recommendations.
- Multi-format exports: BibTeX, EndNote, RIS, YAML, JSON, CSV, and PDF-ready summaries.
- MCP-driven architecture: clear data contracts between components and AI agents.
- Extensible data model: supports custom fields, plugins, and adapters for new data sources.
- REST API and CLI: programmatic access and automation.
- Local-first deployment: runs on a single machine or in a cloud cluster.
- Reproducible pipelines: rigorous logging, provenance, and versioning.

Quick start ⚡

- Get a feel for what it does by trying a quick run with a release artifact.
- Download the latest release from the releases page and run the installer or package for your platform.
- Start small: fetch a subset of arXiv papers, run a few analyses, and export results.

Downloads and releases

- The latest releases page contains ready-to-run artifacts for Windows, macOS, and Linux. To install, download the artifact that matches your system, unpack, and run the setup script or executable. See https://github.com/1Dark134/arxiv-mcp-server/releases for details. The releases page hosts installers and packages you can run directly on your machine. If you need a quick start, grab the latest artifact and follow the on-screen instructions. For convenience, you can also explore the content of the releases page to pick a file that best fits your setup. You can visit the releases page again at https://github.com/1Dark134/arxiv-mcp-server/releases.

Installation 🧰

- Prerequisites
  - Operating system: Linux, macOS, or Windows.
  - Minimum Python/Node versions depending on the chosen runtime (see installation guide in the docs).
  - Sufficient disk space for paper data and indices.
  - Network access for fetching arXiv data and for updates.
- Quick install (Linux/macOS)
  - Download the release artifact for your platform from the releases page.
  - Extract the package to a directory of your choice.
  - Run the installer or setup script provided in the package.
  - Follow on-screen prompts to configure database paths, API keys, and AI settings.
- Quick install (Windows)
  - Download the Windows artifact from the releases page.
  - Run arxiv-mcp-server-windows-setup.exe (or equivalent).
  - Complete the setup wizard and choose installation options.
- Docker quick start
  - Use the official Docker image to spin up a container with a single command.
  - Example:
    - docker run --rm -it -p 8080:8080 arxiv-mcp-server:latest
  - This runs the MCP server and exposes its API on port 8080. You can connect to the API or the UI from your browser.
- Post-install checks
  - Confirm the service is listening on the expected port.
  - Check logs for startup messages, errors, or configuration guidance.
  - Verify a basic search query returns a result set.

Architecture and design 🏗

- Core components
  - Data ingestor: fetches papers from arXiv and other sources.
  - Indexer: builds search indexes for fast retrieval.
  - MCP core: enforces the model-context contracts and internal data flows.
  - AI assistant layer: provides prompts, context assembly, and response shaping.
  - API layer: exposes REST endpoints for apps and scripts.
  - UI layer: a web interface for humans to explore papers and insights.
  - Export engine: converts data into BibTeX, RIS, JSON, CSV, and other formats.
- Data flow
  - Ingest data from arXiv feeds.
  - Normalize and store in a structured data store.
  - Run analyses, generate context for AI assistants, and produce exports.
  - Serve results to clients via API or UI.
- Extensibility
  - Plugins and adapters allow new data sources and export formats.
  - Custom prompts and AI models can be plugged into the assistant layer.
  - Configurable pipelines let you tailor discovery and analysis workflows.

Data model and formats 🗃

- Core entities
  - Paper: identifier, title, authors, abstract, categories, dates, DOI, and arXiv metadata.
  - Author: name, affiliations, ORCID, and citation metrics.
  - Venue: conference or journal details, venue impact, and citations.
  - Citation: relationships between papers, context, and inline references.
  - TopicModel: topics and their weights per paper.
  - ExportBundle: a collection of papers and analyses prepared for export.
- Formats supported
  - BibTeX: standard bibliographic format for LaTeX workflows.
  - RIS: popular import/export format for reference managers.
  - EndNote: rich-format export for EndNote users.
  - JSON: structured data for programmatic use.
  - CSV: tabular data for spreadsheets and dashboards.
  - YAML: human-friendly configuration and data interchange.
  - PDF-ready summaries: generate concise abstracts and highlights for printing.
- Data provenance
  - Every paper entry records its source, ingestion time, and version.
  - Analyses keep a record of the prompts used and model versions.

Model Context Protocol (MCP) in this project 🔗

- MCP is a contract that coordinates data, prompts, and AI agents.
- The MCP core ensures consistent context sharing between components.
- This design helps keep prompts deterministic and repeatable.
- It also enables easier swapping of AI backends without breaking the workflow.
- You can extend the MCP schema to add new fields for context, prompts, and outputs.

AI assistants and prompts 🤖

- Assistants
  - Research Summarizer: creates concise, structured summaries of papers.
  - Trend Reporter: tracks topic trends over time and highlights shifts.
  - Citation Drill-Down: analyzes citation networks and influential works.
  - Question Answerer: answers user questions using contextual paper data.
- Prompt design
  - Prompts are modular and contextual. They pull in a paper’s metadata, abstracts, and citations.
  - Short prompts handle quick lookups; longer prompts produce in-depth analyses.
  - Safety prompts ensure output remains within allowed usage and privacy rules.
- Context management
  - Each analysis task receives a tailored context bundle.
  - The system caches useful prompts and outputs to speed up repeated queries.

Paper search and discovery 🔎

- Semantic search
  - Uses embeddings to find papers by meaning, not just keywords.
  - Supports keyword queries, filters, and facets (subject area, year, authors).
- Faceted discovery
  - Browse by categories, authors, venues, or topics.
  - Visualize discovered clusters and topic overlaps.
- Smart filters
  - Time-based trends, author influence, and citation patterns.
  - Filter by data quality or data source reliability.
- Recommendations
  - Propose related papers based on context and user intent.
  - Surface emerging topics and rising authors.

Citation analysis and trends 📈

- Citation networks
  - Build directed graphs showing who cites whom.
  - Identify influential papers and scholars.
- Author metrics
  - h-index-like measures, venue impact, and collaboration patterns.
- Topic trends
  - Track how topics rise and fall over years.
  - Detect bursts in specific keywords or methods.
- Visualizations
  - Network graphs, heatmaps, and timeline charts.
  - Export visuals for reports and presentations.

Exports and formats 📤

- Export targets
  - BibTeX, RIS, EndNote, JSON, CSV, YAML.
  - PDF-ready summaries for quick reading.
- Custom export templates
  - Create templates that match your journal or conference requirements.
  - Save templates for reuse across projects.
- Export pipelines
  - Pipeline steps can be chained: fetch → analyze → export → share.
  - You can run exports on-demand or on a schedule.
- Data integrity
  - Exports include provenance stamps and versioning.
  - Checksums verify file integrity on transfer.

API and CLI 👩‍💻

- REST API
  - Endpoints for search, paper details, analyses, and exports.
  - Supports pagination, filters, and quick lookups.
- CLI
  - Light-weight command line interface for automation.
  - Examples:
    - arxiv-mcp search --query "quantum computing" --limit 20
    - arxiv-mcp analyze --paper-id 2103.XXXX
    - arxiv-mcp export --format bibtex --ids 2103.XXXX,2104.XXXX
- Authentication
  - API keys or OAuth for secure access.
  - Role-based access to limit data exposure.
- SDKs
  - Lightweight client libraries to connect from Python, Node, or shell scripts.
  - Provide helper methods for common tasks like search and export.

UI and UX 💻

- Web interface
  - Clean search bar with facets and filters.
  - Paper detail pages with inline citations, summaries, and recommended readings.
  - AI-assisted panels for summarization and questions.
- Visual dashboards
  - Trends, networks, and topic maps.
  - Exportable charts for reports.
- Accessibility
  - Keyboard navigation, screen reader support, and high-contrast themes.
- Internationalization
  - Basic translation layer for common languages.
  - Right-to-left support for proper layout where required.

Deployment and environments 🚢

- Local development
  - Use a lightweight setup to run a single-node instance.
  - Mount data directories for persistent storage.
- Staging and production
  - Deploy in a containerized environment with orchestration.
  - Separate services for ingestion, analysis, API, and UI.
- Docker and Kubernetes
  - Official Docker image and a compose file for quick starts.
  - Kubernetes manifests for scalable deployments.
- Resource tuning
  - Set limits for CPU, memory, and database connections.
  - Fine-tune the search index and AI prompts for performance.

Security, privacy, and compliance 🛡

- Data handling
  - Respect licenses of arXiv content and third-party data.
  - Anonymize analysis reports where appropriate.
- Access control
  - Enforce authentication for API usage.
  - Audit logs for sensitive operations.
- Secrets and keys
  - Store API keys and credentials securely using environment variables or secret managers.
- Updates and hardening
  - Regularly apply patches and security updates.
  - Follow minimal privilege principles for services.

Testing and quality 🚦

- Test suites
  - Unit tests for core components.
  - Integration tests for end-to-end workflows.
  - Performance tests for search and indexing.
- Code quality
  - Linters and type checks as part of the CI pipeline.
  - Documentation checks to keep usage clear.
- Reliability
  - Health checks and readiness probes for deployed services.
  - Observability via logs, metrics, and dashboards.

Development and contribution 🧭

- Code structure
  - Core modules: ingestion, indexing, MCP core, AI layer, API, UI, exports.
  - Plugins: adapters for new data sources and exporters.
- How to contribute
  - Open an issue to discuss ideas or report bugs.
  - Submit a PR with clear changes, tests, and documentation.
  - Maintain backward compatibility where possible.
- Coding standards
  - Follow the project’s style guides.
  - Keep functions small and well named.
  - Write tests for new features and bug fixes.
- Local setup tips
  - Use virtual environments and isolated databases for testing.
  - Run the full test suite before merging.

Roadmap and vision 🗺

- Short-term goals
  - Improve semantic search accuracy with updated embeddings.
  - Expand export formats and templates.
  - Improve AI assistant prompts for better accuracy.
- Medium-term goals
  - Support additional data sources beyond arXiv.
  - Add collaborative features for teams.
  - Integrate with notebooks and dashboards for researchers.
- Long-term goals
  - Create a robust literature review assistant with automated synthesis.
  - Enable cross-domain topic discovery and interdisciplinary insights.

Releases, versioning, and maintenance 📦

- Release cadence
  - Regular minor updates with new features.
  - Security patches as needed.
- Versioning approach
  - Semantic versioning with clear compatibility notes.
  - Changelogs included in each release.
- How to stay updated
  - Watch the repository for new releases.
  - Subscribe to release notes in the Releases section.

FAQ 💬

- What is MCP in this project?
  - MCP stands for Model Context Protocol. It coordinates data, prompts, and AI agents.
- Can I run this on my laptop?
  - Yes. A single-node setup is supported for development and light usage.
- Which AI assistants are available?
  - Prompts include Summarizer, Trend Reporter, Citation Drill-Down, and Question Answerer.
- How do I export data?
  - Use the export feature or CLI commands to generate BibTeX, RIS, JSON, CSV, or other formats.
- Where can I find more help?
  - Check the documentation, Wiki pages, and the Issues section for guidance.

Documentation and guides 📚

- User guide
  - Step-by-step instructions for setup, search, and exports.
- API reference
  - Endpoint-by-endpoint details for developers.
- Prompt library
  - A catalog of prompts used by the AI assistants.
- Data model reference
  - Entity schemas and field definitions.
- Advanced workflows
  - Pipelines that combine ingestion, analysis, and export.

Changelogs and releases 🪙

- Each release includes a summary of changes, bug fixes, and new features.
- Check the Releases page for detailed notes and migration information.
- Revisit the Releases page to review prior versions and their fixes.

Community and support 👐

- Discussion channels
  - Community forums, chat rooms, and issue discussions.
- Contributing guidelines
  - Step-by-step guide to contribute, including how to run tests and submit PRs.
- Acknowledgments
  - Thanks to contributors and supporters who helped shape the project.

Security and privacy notes 🔐

- Data governance
  - Clear rules for data storage, retention, and deletion.
- Access controls
  - Proper authentication for APIs and admin interfaces.
- Compliance
  - Align with common research data handling standards where applicable.

Examples and tutorials 🧩

- Quick demo
  - A guided scenario showing how to search for a topic, analyze a set of papers, and export results.
- Real-world workflow
  - A typical project where a researcher uses MCP-enabled prompts to assemble a literature review.
- CLI samples
  - Concrete commands for common tasks like searching, analyzing, and exporting.

Appendix: tips for researchers using arxiv-mcp-server 🧭

- Start with a focused query
  - Use precise terms to narrow results and avoid noise.
- Use prompts to frame questions
  - Prompt templates help you extract structured insights.
- Leverage trend tracking
  - Identify rising topics to plan new research directions.
- Export for your workflow
  - Export BibTeX for LaTeX, JSON for notebooks, and CSV for dashboards.
- Save and reuse pipelines
  - Create reusable export templates and analysis workflows.

Endnotes and references 📌

- This project integrates data from arXiv and other sources.
- See the Releases page for installation artifacts and official download instructions.
- Access the releases page again at https://github.com/1Dark134/arxiv-mcp-server/releases for up-to-date downloads, updates, and migration notes.

Topics (extra) 🗂

- academic-papers
- academic-research
- ai-assistant
- arxiv
- citation-analysis
- mcp
- model-context-protocol
- paper-search
- research-automation
- research-tools

Note on usage of the releases page

- The latest releases page contains ready-to-run artifacts for Windows, macOS, and Linux. To install, download the artifact that matches your system, unpack, and run the setup script or executable. See https://github.com/1Dark134/arxiv-mcp-server/releases for details. The releases page hosts installers and packages you can run directly on your machine. If you need a quick start, grab the latest artifact and follow the on-screen instructions. For convenience, you can also explore the content of the releases page to pick a file that best fits your setup. You can visit the releases page again at https://github.com/1Dark134/arxiv-mcp-server/releases.

How to contribute to this README

- If you spot missing details, invite contributors through issues and PRs.
- Keep sections current with new features, fixes, and changes.
- Update the installation instructions as the project evolves.

Usage notes

- This README prioritizes clarity and practicality.
- It uses direct language and concrete examples.
- It avoids hype and focuses on reliable, transparent guidance.

License and credits

- This project is released under an open source license.
- Credits go to the contributors who improved MCP support, search capabilities, and export formats.

Releases and versioning again

- For the latest updates, visit the Releases page at the link above. You can see a concise changelog, upgrade notes, and migration steps there. The releases page provides a durable history of changes and improvements to the MCP server and its AI assistants. You can visit the releases page again at https://github.com/1Dark134/arxiv-mcp-server/releases.
