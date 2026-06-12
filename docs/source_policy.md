# AIWatch Source Policy

AIWatch is a low-noise, high-density AI radar. It is not a generic technology feed, a business newsletter, or a broad product-design digest.

## What We Keep

Core sources must be directly useful to readers tracking AI models, agents, developer tools, research, safety, and AI products.

The curated categories are:

- `official`: official model labs, products, APIs, and first-party release channels.
- `industry_leader`: founders, researchers, engineering/product leaders, and high-signal individual builders.
- `technical_share`: frameworks, open-source projects, engineering blogs, evaluation sources, and high-density AI technical media.

Every source in `data/sources/curated_ai_sources.json` carries `ai_density_score`. Sources below 6 do not enter the core pool.

## What We Exclude

Generic big-company engineering sources are excluded by default. They may occasionally publish AI engineering content, but their regular mix includes backend, frontend, operations, testing, architecture, and business engineering.

Generic technology newsletters are excluded by default. Quality alone is not enough; AI density must be stable.

Business, finance, management, and startup commentary sources are excluded by default. They can be useful context, but they add too much non-AI noise to the core reader.

Frontend, design, UI, product-experience, and growth-design sources are excluded by default. They may intersect with AI products, but they are not reliable core AI radar sources.

Marketing-heavy AI sources are excluded or downgraded. Course funnels, tool advertorials, exaggerated headlines, shallow concept posts, and short posts with no new information should not drive the default feed.

Podcast, video, account-personalization, TTS daily briefing, immersive translation, and heavy recommendation systems are outside this round.

## Source Audit

`data/sources/source_audit_report.csv` records keep/drop decisions and reasons. Important fields:

- `exclusion_reason`
- `ai_density_estimate`
- `marketing_risk`
- `commercial_content_ratio`
- `generic_tech_ratio`
- `keep_or_drop_reason`

The report includes explicit examples such as Tencent engineering, Meituan engineering, Ruan Yifeng, Liu Run, and Wu Xiaobo style sources so they do not re-enter the curated pool by accident.

## Research Boundary

We borrow mechanisms from RSS readers, AI briefing products, real-time news clusters, and LLM workflow systems:

- real-time hotspot clustering
- multi-source same-event grouping
- lightweight subscription health UX
- staged processing: T0 parse, T1 light judgment, T2 deep extraction, T3 selected output
- deterministic score composition after structured model output
- optional reflection for high-value candidates

We do not copy source pools, prompt text, UI, code structure, workflow templates, or product positioning from any reference project.

## Chinese Summary Rules

AIWatch prefers Chinese summaries over full bilingual translation. The glossary in `data/glossary/ai_terms_zh.json` is the source of truth for common AI terms.

Immersive translation is not part of the core path because it would shift the product toward a full reading/translation tool. The current path is concise Chinese understanding: summary, tags, viewpoints, source links, and enough context to decide whether to read the original.

## WeChat RSS Risk

WeChat RSS bridges are useful but high-risk as a core dependency. They rely on third-party conversion, platform policy, authentication, and parsing stability. We may support them later as optional sources with high `source_dependency_risk`; they should not anchor the default source pool.
