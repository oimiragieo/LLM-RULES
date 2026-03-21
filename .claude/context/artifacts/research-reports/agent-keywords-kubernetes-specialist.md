<!-- Agent: agent-creator | Task: validation | Session: 2026-02-22 -->

# Kubernetes Specialist — Occupational Alignment Research Report

**Version:** 1.0.0
**Date:** 2026-02-22
**Agent:** kubernetes-specialist
**Pipeline:** Step 2.3 (BLS + Ongig + MyMajors) + Step 2.5 (Keyword Research)
**Purpose:** Delta comparison — what occupational research adds over manual agent creation

---

## 1. BLS Occupational Alignment

### 1.1 Matched Occupations

Three BLS OOH occupations map to the Kubernetes specialist role:

| BLS Occupation | SOC Code | Relevance |
|---|---|---|
| Computer Network Architects | 15-1241 | HIGH — designs infrastructure, multi-cloud, network topology |
| Network and Computer Systems Administrators | 15-1244 | MEDIUM-HIGH — cluster ops, troubleshooting, uptime |
| Software Developers, Systems Software | 15-1252 | MEDIUM — operator/controller development in Go |

### 1.2 Computer Network Architects (15-1241) — Key Findings

**Core Tasks (Tab-2):**
- Design and deploy computer and information networks (LANs, WANs, cloud VPCs)
- Consider security requirements when planning networks
- Deploy and configure network equipment (maps: CNI plugins, network policies)
- Test equipment and networks during all stages of implementation
- Create documentation throughout design and deployment
- Analyze data traffic and system performance to determine future upgrades
- Troubleshoot network issues post-deployment

**Emerging Skills (from industry research augmenting BLS):**
- Multi-cloud and hybrid-cloud network architecture
- Infrastructure as Code (Terraform, Pulumi — NOT Terraform alone)
- eBPF-based network observability (Cilium, Tetragon)
- FinOps / cloud cost optimization for Kubernetes workloads

**Job Outlook:** +12% growth 2024–2034 (much faster than average). Median wage: $130,390 (May 2024).

**What the manual agent missed from this occupation:**
- IaC tools beyond Helm/Kustomize: **Terraform and Pulumi** as explicit K8s IaC layers
- **eBPF** as an emerging networking and security technology
- **Cloud cost optimization / FinOps** as a core platform engineer responsibility
- **Documentation-first mindset** as a formal BLS-listed task (partially present in agent but not explicit)

### 1.3 Network and Computer Systems Administrators (15-1244) — Key Findings

**Core Tasks:**
- Organize, install, and support computer systems including LANs, WANs, intranets
- Fix server problems and maintain system uptime
- Monitor performance and troubleshoot issues
- Maintain security and backups

**Emerging Skills:**
- Cloud-native administration (EKS, GKE, AKS)
- Automation scripting (Python, Bash, Go)
- Monitoring and alerting systems

**Job Outlook:** -4% projected decline 2024–2034 (duties absorbed into cloud/K8s platform roles). This decline is important context: the BLS SysAdmin role is being replaced by Kubernetes/platform engineers, confirming the specialist demand.

**What the manual agent missed:**
- Formal **backup/restore procedures** framing (partially covered in Velero but not as explicit operational task)
- **SLA/uptime commitment** perspective (not mentioned in agent; SRE-adjacent but distinct)

### 1.4 Software Developers, Systems Software (15-1252) — Key Findings

**Core Tasks:**
- Design operating systems and software for embedded systems
- Write and test code, debug programs
- Determine operational feasibility of technical design

**Relevance to K8s specialist:**
- Maps to Kubernetes operator development (controller-runtime Go)
- CRD authoring, webhook development, custom controller logic

---

## 2. Ongig Job Title Alignment (Step 2.3b)

Ongig direct search did not return a dedicated Kubernetes title article. Cross-referencing with Ongig engineering titles post, Teal, Kube Careers 2025 report, and LinkedIn job data:

### 2.1 Official Title Variants Found

| Title | Seniority | Search Volume |
|---|---|---|
| Kubernetes Engineer | Mid-Senior | High |
| Kubernetes Platform Engineer | Senior | High |
| Senior Kubernetes Platform Engineer | Senior | High |
| Cloud Native Engineer | Mid | Medium |
| Platform Engineer | Mid-Senior | Very High |
| Site Reliability Engineer (Kubernetes) | Senior | High |
| DevOps Engineer (Kubernetes) | Mid | High |
| Infrastructure Engineer (K8s) | Mid | Medium |
| Staff Kubernetes Engineer | Staff | Low-Medium |
| Principal Platform Engineer | Principal | Low |
| Cloud Infrastructure Engineer | Mid | Medium |
| Kubernetes DevOps Engineer | Mid | Medium |
| Container Platform Engineer | Mid-Senior | Medium |

### 2.2 Seniority Ladder (Kube Careers 2025 data)

```
Junior Engineer → Engineer → Senior Engineer → Staff Engineer → Principal Engineer → Distinguished Engineer
```

Most common open roles: **Senior** and **Staff** levels.

### 2.3 Title Keywords NOT in Current Routing Table

Comparing with `routing-table-core-map.cjs` kubernetes-specialist section (current entries: `kubernetes`, `k8s`, `kubectl`, `helm`, `kustomize`, `argocd`, `kubernetes-operator`, `pod-debugging`, `k8s-manifest`, `gitops`):

**Missing routing keywords from title research:**
- `flux` (Flux v2 — ArgoCD alternative, present in agent body but not routing)
- `karpenter` (node autoscaler — present in agent body but not routing)
- `eks` (Amazon EKS)
- `gke` (Google GKE)
- `aks` (Azure AKS)
- `containerd` (container runtime)
- `cni` (CNI plugin work)
- `networkpolicy` (Kubernetes NetworkPolicy authoring)
- `rbac` (Kubernetes RBAC design)
- `kyverno` (policy engine — present in agent body but not routing)
- `opa` (OPA Gatekeeper)
- `cluster-api` (CAPI)
- `velero` (backup/restore)
- `cilium` (eBPF CNI)

### 2.4 Colloquial Aliases Observed in Job Postings

- "K8s Platform Engineer" (very common)
- "cloud-native engineer"
- "container orchestration engineer"
- "infrastructure platform engineer"
- "cluster operations engineer"

---

## 3. MyMajors Research (Step 2.3c)

### 3.1 Best Career Match

MyMajors does not have a dedicated Kubernetes or Platform Engineer career. Closest match: **Network and Computer Systems Administrators**.

Secondary matches: Software Developers (Systems Software), Computer Systems Analysts.

### 3.2 Relevant Skills from BLS/MyMajors Network Admin Career

From BLS OOH tab-4 (tools/technology) for Network and Computer Systems Administrators:

**Knowledge Areas:**
- Computers and Electronics
- Telecommunications
- English Language (documentation, communication)
- Engineering and Technology
- Customer and Personal Service (stakeholder communication — often missed in agent persona)
- Education and Training (knowledge sharing, onboarding)

**Skills:**
- Critical thinking
- Active listening
- Complex problem solving
- Systems analysis
- Systems evaluation
- Operations analysis
- Judgment and decision making
- Programming (Python, Bash, Go)

**Work Activities:**
- Getting information
- Analyzing data or information
- Making decisions and solving problems
- Processing information
- Communicating with supervisors/peers/subordinates
- Updating and using relevant knowledge
- Identifying objects, actions, and events
- Estimating the quantifiable characteristics of products/events

**What the manual agent missed from MyMajors/BLS skills:**
- Explicit **"training and knowledge transfer"** dimension (agents teaching teams, writing runbooks)
- **"Vendor evaluation"** / tool selection capability (choosing between Cilium vs Calico, etc.)
- **Capacity planning** as a formal skill area
- **Cost optimization / FinOps** for cloud-native workloads

---

## 4. Skills Gap Analysis (Step 2.3d)

### 4.1 Consolidated Real-World Skills Inventory

From BLS + Ongig + MyMajors + Industry sources:

| Skill Area | Source | Status in Current Agent |
|---|---|---|
| Kubernetes cluster design & deployment | All | COVERED |
| Workload authoring (Deployments, StatefulSets, etc.) | BLS/Industry | COVERED |
| Helm chart authoring | Ongig/Industry | COVERED |
| Kustomize overlays | Ongig/Industry | COVERED |
| GitOps (ArgoCD) | Ongig/Industry | COVERED |
| GitOps (Flux v2) | Ongig/Industry | COVERED |
| RBAC design | BLS/Industry | COVERED |
| NetworkPolicy | BLS/Industry | COVERED |
| OPA Gatekeeper / Kyverno | Industry | COVERED |
| Observability (Prometheus/Grafana) | BLS/Industry | COVERED |
| Multi-cluster management | Industry | COVERED |
| Operator development (controller-runtime) | BLS/Industry | COVERED |
| EKS/GKE/AKS managed clusters | Industry | COVERED |
| Ingress/Gateway API | Industry | COVERED |
| Service mesh (Istio/Linkerd) | Industry | COVERED |
| Supply chain security (cosign/SBOM) | Industry | COVERED |
| Storage/CSI/StatefulSet | Industry | COVERED |
| HPA/VPA autoscaling | Industry | COVERED |
| Karpenter node provisioning | Industry | COVERED |
| **Terraform / Pulumi IaC** | BLS/Industry | **GAP — not in agent** |
| **eBPF (Cilium/Tetragon)** | BLS/Industry | **PARTIAL — Cilium listed as CNI but eBPF not explicit** |
| **Cloud cost optimization / FinOps** | BLS/Industry | **GAP — not mentioned** |
| **Capacity planning** | BLS/MyMajors | **GAP — not mentioned** |
| **Runbook authoring / SLA management** | BLS/MyMajors | **PARTIAL — runbook referenced but not framed as SLA/uptime ownership** |
| **Vendor/tool evaluation** | MyMajors | **GAP — not mentioned** |
| **Team knowledge transfer / onboarding** | MyMajors | **GAP — not mentioned** |
| **CKA/CKS certifications** | Industry/BLS | **GAP — certifications not mentioned** |
| **Pulumi** | BLS/Industry | **GAP — not listed** |
| **Container runtime (containerd, CRI-O)** | Industry | **PARTIAL — Docker listed but containerd/CRI-O not explicit** |
| **Chaos engineering** | Industry | **GAP — not mentioned** |
| **Progressive delivery (Argo Rollouts/Flagger)** | Industry | COVERED |
| **Internal Developer Platform (IDP)** | Industry | **GAP — not framed** |
| **Platform engineering as discipline** | Industry | **GAP — agent is K8s-focused but doesn't frame IDP/platform engineering** |

### 4.2 Skill Catalog Mapping

From the skill catalog, these skills exist but are NOT in the kubernetes-specialist frontmatter:

| Existing Skill | Relevance | Add to Agent? |
|---|---|---|
| `terraform-infra` | Core IaC for EKS/GKE/AKS provisioning | YES |
| `gitops-workflow` | Dedicated GitOps skill (ArgoCD/Flux) | YES |
| `helm-chart-scaffolding` | Helm design (complementary to k8s-manifest-generator) | YES |
| `k8s-security-policies` | NetworkPolicy, PSP, RBAC | YES |
| `kubernetes-flux` | Flux-specific cluster management | YES |
| `ci-cd-implementation-rule` | CI/CD pipeline integration | YES |
| `on-call-handoff-patterns` | SRE on-call management | OPTIONAL |
| `postmortem-writing` | Blameless postmortem for K8s incidents | OPTIONAL |
| `incident-runbook-templates` | Runbook creation | YES |

---

## 5. Keyword Research (Step 2.5)

### 5.1 Search 1: "kubernetes engineer common tasks responsibilities 2026"

**Source:** Wiz Academy, NovelVista, Kubernetes.io tasks, DevToolbox

**High-Confidence Keywords (unique to K8s specialist):**
- `cluster lifecycle management`
- `pod scheduling optimization`
- `etcd backup/restore`
- `admission webhook`
- `validating webhook`
- `mutating webhook`
- `custom resource definition` / `CRD`
- `controller reconciliation loop`
- `container image scanning`
- `node taint/toleration`
- `resource quota`
- `limit range`
- `kubeconfig`
- `context switching` (kubectl contexts)
- `OIDC integration`
- `workload identity`

**Medium-Confidence Keywords (overlap risk with devops/sre):**
- `infrastructure as code`
- `CI/CD pipeline`
- `container orchestration`
- `observability`
- `alerting`
- `GitOps`
- `cloud-native`

**Action Verbs (from job descriptions):**
- orchestrate, provision, harden, scale, reconcile, remediate, migrate, federate, namespace, shard, gate, triage, rollout, rollback, bootstrap

**Problem Indicators (phrases that should route to k8s-specialist):**
- "pod is CrashLoopBackOff"
- "OOMKilled container"
- "pending pod not scheduling"
- "image pull backoff"
- "service not routing"
- "ingress 502/503"
- "cluster is unreachable"
- "Helm chart fails to render"
- "ArgoCD sync failed"
- "RBAC denied"
- "PVC stuck in pending"
- "node not ready"
- "evicted pod"
- "resource quota exceeded"
- "HPA not scaling"
- "certificate expired"

### 5.2 Search 2: "kubernetes platform engineer terminology keywords phrases"

**Source:** Yardstick, TestGorilla, CuratePartners, speaktechenglish.com

**Domain Terminology Inventory:**

Core K8s objects (all covered in agent): Pod, Deployment, StatefulSet, DaemonSet, Job, CronJob, Service, Ingress, ConfigMap, Secret, PVC, PV, StorageClass, RBAC, NetworkPolicy, ServiceAccount, Namespace, Node, ReplicaSet, Endpoint, HPA, VPA, PDB, LimitRange, ResourceQuota.

**Additional terminology NOT in current agent:**
- `etcd` — K8s backing store, backup/restore is an admin task
- `kube-apiserver` / `kube-scheduler` / `kube-controller-manager` — control plane components
- `control plane` vs `data plane` terminology
- `node pool` / `node group` management
- `kubeadm` upgrade procedure
- `containerd` / `CRI-O` runtime
- `eBPF` — emerging networking/security paradigm
- `Tetragon` — eBPF runtime security from Cilium project
- `Kubewarden` — Wasm-based policy engine (alternative to Kyverno/OPA)
- `cert-manager` — TLS certificate lifecycle management
- `external-dns` — DNS record automation
- `KEDA` — Kubernetes Event-Driven Autoscaling (not mentioned in current agent)
- `Crossplane` — Infrastructure provisioning via K8s API
- `Backstage` — IDP/developer portal (platform engineering adjacent)
- `Tekton` — K8s-native CI/CD (alternative to external CI)
- `Argo Workflows` — workflow orchestration (beyond Argo CD)
- `OpenCost` / `Kubecost` — FinOps tooling
- `VCluster` / `Cluster-per-namespace` — multi-tenancy patterns
- `Gateway API` — next-gen Ingress (mentioned in agent but worth keyword emphasis)

### 5.3 Search 3: "kubernetes specialist use cases problem types SRE platform engineer"

**Source:** Komodor, Spacelift, Grid Dynamics, Kubernetes SRE guides

**Use Case Categories (for routing accuracy):**

| Problem Type | Example Trigger Phrases |
|---|---|
| Workload failures | CrashLoop, OOMKilled, ImagePullBackOff, Evicted |
| Scheduling failures | Pending pod, node taint, resource quota |
| Networking failures | Service unreachable, CNI errors, NetworkPolicy blocks |
| Storage failures | PVC pending, volume mount errors, CSI issues |
| Autoscaling | HPA not triggering, VPA recommendations, Karpenter node sizing |
| Security hardening | RBAC audit, PSS enforcement, Falco alerts |
| GitOps drift | ArgoCD OutOfSync, Flux reconciliation failure |
| Operator lifecycle | CRD schema validation, webhook errors, finalizer stuck |
| Multi-cluster | ApplicationSet targeting, cluster federation, cross-cluster DNS |
| Cost optimization | Node overprovisioning, idle pods, right-sizing |
| Cluster upgrades | kubeadm upgrade, EKS managed node group rotation, drain/cordon |
| Certificate/TLS | cert-manager issuers, expired certificates, mTLS debugging |
| Backup/restore | Velero snapshot, etcd backup, disaster recovery |

---

## 6. Delta Summary: What Occupational Research Surfaced vs Manual Creation

### What Manual Creation Got Right

The manually-created kubernetes-specialist agent is technically comprehensive and covers the core K8s API surface very well. Workload design, networking, Helm/Kustomize, GitOps, security hardening, storage, observability, cluster operations, and operator development are all properly addressed. The agent persona and workflow sections are well-structured.

### What Occupational Research Adds (the delta)

| Category | Finding | Priority |
|---|---|---|
| IaC Tools | Terraform and Pulumi as K8s cluster provisioning tools (not just app manifests) | HIGH |
| eBPF | Emerging networking/security paradigm — Cilium Tetragon, eBPF observability | HIGH |
| FinOps/Cost | Cloud cost optimization as a core platform engineer responsibility (FinOps tools: Kubecost, OpenCost) | HIGH |
| KEDA | Event-driven autoscaling — widely used, not mentioned | HIGH |
| cert-manager | TLS cert lifecycle — universally deployed, not mentioned | HIGH |
| Job Title Keywords | 14+ routing keywords missing (flux, karpenter, eks, gke, aks, containerd, cni, kyverno, etc.) | HIGH |
| Capacity planning | BLS-listed formal skill, absent from agent | MEDIUM |
| IDP/Platform Engineering framing | Backstage, Crossplane, Internal Developer Platform context | MEDIUM |
| Certifications | CKA/CKS/CKAD as credentialing context for example interactions | MEDIUM |
| Control plane components | etcd, kube-apiserver, kube-scheduler — admin tasks reference | MEDIUM |
| Vendor/tool evaluation | Choosing between CNI plugins, policy engines, GitOps tools | MEDIUM |
| Knowledge transfer | Onboarding teams to K8s platform, writing runbooks | LOW |
| Chaos engineering | Chaos Mesh, LitmusChaos for K8s resilience testing | LOW |

### Missing Skills from Skill Catalog

Skills that exist but are absent from the agent frontmatter:
- `terraform-infra` — cluster provisioning IaC
- `gitops-workflow` — dedicated GitOps skill
- `helm-chart-scaffolding` — Helm design skill
- `k8s-security-policies` — NetworkPolicy/PSP/RBAC skill
- `kubernetes-flux` — Flux-specific management
- `incident-runbook-templates` — runbook authoring

---

## 7. Security Gate Results

| Check | Result |
|---|---|
| SIZE CHECK (< 50KB per source) | PASS |
| PROMPT INJECTION SCAN | PASS — no "ignore previous", "you are now", "act as" patterns |
| TOOL INVOCATION SCAN | PASS — no Bash(/Task(/Write( in fetched prose |

All external content cleared for incorporation.

---

## 8. Sources

- [BLS OOH: Network and Computer Systems Administrators](https://www.bls.gov/ooh/computer-and-information-technology/network-and-computer-systems-administrators.htm)
- [BLS OOH: Computer Network Architects](https://www.bls.gov/ooh/computer-and-information-technology/computer-network-architects.htm)
- [Wiz Academy: Kubernetes Engineer Job Description](https://www.wiz.io/academy/container-security/kubernetes-engineer-job-description)
- [TestGorilla: Kubernetes Engineer Job Description](https://www.testgorilla.com/blog/kubernetes-developer-job-description/)
- [Curate Partners: Kubernetes Platform Engineer](https://curatepartners.com/jobs/kubernetes-platform-engineer/)
- [Cloud Native Now: Most Cloud-Native Roles are Software Engineers](https://cloudnativenow.com/contributed-content/you-are-more-likely-to-land-a-lead-level-cloud-native-role-than-a-junior-one/)
- [Spacelift: 12 Kubernetes Use Cases](https://spacelift.dev/blog/kubernetes-use-cases)
- [Komodor: Platform Engineer's Guide to Kubernetes](https://komodor.com/blog/the-platform-engineers-guide-to-navigating-kubernetes-with-confidence/)
- [PlatformEngineering.org: FinOps Tools 2026](https://platformengineering.org/blog/10-finops-tools-platform-engineers-should-evaluate-for-2026)
- [Okta: Senior SRE Kubernetes Job Posting](https://www.okta.com/company/careers/engineering/senior-site-reliability-engineer-kubernetes-6677363/)
- [TheLinuxCode: Kubernetes Certification Paths 2026](https://thelinuxcode.com/kubernetes-certification-paths-for-different-roles-2026-guide/)
