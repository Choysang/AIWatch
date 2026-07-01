export interface EditorialPreferenceInput {
  selectionScore: number;
  ownerBoost: number;
  title: string;
  summary: string | null;
  contentType: string | null;
  sourceType: string | null;
}

export interface EditorialPreferenceResult {
  score: number;
  reasons: string[];
}

function clampScore(score: number): number {
  if (score < 0) return 0;
  if (score > 100) return 100;
  return Math.round(score * 10) / 10;
}

function haystack(input: EditorialPreferenceInput): string {
  return `${input.title} ${input.summary ?? ""}`.toLowerCase();
}

function apply(score: number, delta: number, reasons: string[], reason: string): number {
  reasons.push(reason);
  return score + delta;
}

function isPrMarketing(input: EditorialPreferenceInput, text: string): boolean {
  if (!/(合作|达成合作|战略合作|客户案例|case study|customer story|partnership|partner|bank|银行|enterprise customer)/i.test(text)) {
    return false;
  }
  const hasTechnicalEvidence =
    /(api|sdk|benchmark|基准|模型|open[- ]?weight|开源|训练|评测|代码|技术细节|latency|吞吐|架构)/i.test(text);
  const deniesTechnicalEvidence =
    /(没有|无|缺少|without|no).{0,16}(api|sdk|模型|产品|技术细节|代码|评测|架构)/i.test(text);
  if (input.sourceType === "official") return !hasTechnicalEvidence || deniesTechnicalEvidence;
  return !hasTechnicalEvidence || deniesTechnicalEvidence;
}

function isBottomLayerPaper(input: EditorialPreferenceInput, text: string): boolean {
  if (input.contentType !== "research") return false;
  if (!/(paper|论文|pretraining|pre-training|optimizer|batch[- ]?size|loss|gradient|scheduler|训练技巧|底层训练|微调细节)/i.test(text)) {
    return false;
  }
  return !/(agent|rag|eval|benchmark|代码|开源|recipe|实践|应用|tool|workflow|安全|推理|部署|serving)/i.test(text);
}

function isLegalRegulatory(text: string): boolean {
  return /(lawsuit|sued|copyright|regulat|antitrust|doj|ftc|eu ai act|诉讼|起诉|版权|监管|反垄断|合规|政策)/i.test(text);
}

function isPureAutoNoise(text: string): boolean {
  if (!/(汽车|车厂|车型|suv|轿车|续航|座舱|交付|售价|新车|autonomous|noa|智能驾驶|自动驾驶)/i.test(text)) {
    return false;
  }
  if (/(ai|模型|model|自动驾驶|autonomous|端到端|end[- ]to[- ]end|训练|评测|多模态|芯片|算力|算法|noa|智驾)/i.test(text)) {
    return false;
  }
  return true;
}

function isPersonalSource(input: EditorialPreferenceInput): boolean {
  return input.sourceType === "employee" || input.sourceType === "expert" || input.sourceType === "kol";
}

function hasPracticalTechnicalEvidence(text: string): boolean {
  return /(api|sdk|code|github|repo|benchmark|eval|architecture|prompt|workflow|agent|rag|implementation|debug|latency|serving|开源|代码|复现|实测|评测|架构|教程|技巧|工作流|踩坑|部署|实现|提示词|经验|复盘)/i.test(text);
}

function isPersonalSelfPromo(input: EditorialPreferenceInput, text: string): boolean {
  if (!isPersonalSource(input)) return false;
  if (!/(my|i built|i launched|we launched|course|workshop|newsletter|subscribe|sponsor|waitlist|consulting|我的|我写|我做|我上线|发布了我的|课程|训练营|订阅|付费|报名|咨询|限时|优惠|客户|案例)/i.test(text)) {
    return false;
  }
  return !hasPracticalTechnicalEvidence(text);
}

function isPersonalTechnicalInsight(input: EditorialPreferenceInput, text: string): boolean {
  if (!isPersonalSource(input)) return false;
  if (isPersonalSelfPromo(input, text)) return false;
  return hasPracticalTechnicalEvidence(text) && /(how|guide|pattern|lesson|mistake|pitfall|playbook|我如何|指南|模式|经验|复盘|踩坑|方法|最佳实践|深度解析)/i.test(text);
}

export function applyEditorialPreference(input: EditorialPreferenceInput): EditorialPreferenceResult {
  const reasons: string[] = [];
  const text = haystack(input);
  let score = input.selectionScore + input.ownerBoost;
  if (input.ownerBoost !== 0) reasons.push("owner_annotation");

  if (isPrMarketing(input, text)) score = apply(score, -24, reasons, "pr_marketing");
  if (isBottomLayerPaper(input, text)) score = apply(score, -16, reasons, "bottom_layer_paper");
  if (isLegalRegulatory(text)) score = apply(score, 14, reasons, "legal_regulatory");
  if (isPureAutoNoise(text)) score = apply(score, -36, reasons, "pure_auto_noise");
  if (isPersonalSelfPromo(input, text)) score = apply(score, -22, reasons, "personal_self_promo");
  if (isPersonalTechnicalInsight(input, text)) score = apply(score, 6, reasons, "personal_technical_insight");

  return { score: clampScore(score), reasons };
}
