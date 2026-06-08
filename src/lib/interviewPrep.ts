import type { ResumeData } from "@/types/resume";

export type PrepLevel = "入门" | "核心" | "进阶";

export interface PrepAdvice {
  title: string;
  priority: "高" | "中" | "低";
  reason: string;
  action: string;
  example: string;
}

export interface PrepQuestion {
  id: string;
  set: "JD" | "CV";
  category: string;
  level: PrepLevel;
  question: string;
  why: string;
  followups: string[];
  answerGuide: string;
}

export interface PrepCoverage {
  jd: string[];
  cv: string[];
}

export interface InterviewPrepResult {
  id: string;
  createdAt: string;
  jobTitle: string;
  company: string;
  resumeName: string;
  resumeText: string;
  jobDescription: string;
  advice: PrepAdvice[];
  rewrittenResume: string;
  coverage: PrepCoverage;
  questions: PrepQuestion[];
  memoryNotes: string[];
  source: "local" | "ai";
}

export interface GeneratePrepInput {
  resumeText: string;
  jobDescription: string;
  jobTitle?: string;
  company?: string;
  resumeName?: string;
  memoryNotes?: string[];
}

const TECH_KEYWORDS = [
  "React",
  "Vue",
  "Next.js",
  "Vite",
  "TypeScript",
  "JavaScript",
  "Node.js",
  "Python",
  "Java",
  "Go",
  "C++",
  "SQL",
  "MySQL",
  "PostgreSQL",
  "Redis",
  "MongoDB",
  "Docker",
  "Kubernetes",
  "Linux",
  "Git",
  "CI/CD",
  "AWS",
  "阿里云",
  "腾讯云",
  "Kafka",
  "RabbitMQ",
  "微服务",
  "REST",
  "GraphQL",
  "测试",
  "性能优化",
  "数据分析",
  "Excel",
  "Power BI",
  "Tableau",
  "运营",
  "产品",
  "项目管理",
  "用户增长",
  "B端",
  "C端",
  "销售",
  "客服",
  "市场",
  "设计",
  "Figma",
  "PS",
  "AI",
  "短视频",
  "直播",
  "电商",
  "跨境",
];

const SOFT_KEYWORDS = [
  "沟通",
  "协作",
  "执行",
  "抗压",
  "复盘",
  "学习",
  "推动",
  "落地",
  "增长",
  "优化",
  "分析",
  "管理",
  "表达",
  "责任心",
];

const FALLBACK_AREAS = ["岗位基础能力", "项目经历拆解", "问题排查", "沟通协作", "结果复盘"];

export const normalizeText = (value: string) =>
  value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export const stableId = (value: string) => {
  let hash = 0x811c9dc5 >>> 0;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `prep_${hash.toString(36)}`;
};

const unique = (items: string[]) =>
  Array.from(
    new Set(
      items
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    )
  );

const includesLoose = (source: string, keyword: string) =>
  source.toLowerCase().includes(keyword.toLowerCase());

const extractKnownKeywords = (text: string) => {
  const normalized = normalizeText(text);
  return TECH_KEYWORDS.filter((keyword) => includesLoose(normalized, keyword));
};

const extractSoftKeywords = (text: string) =>
  SOFT_KEYWORDS.filter((keyword) => includesLoose(text, keyword));

const extractChineseTerms = (text: string) => {
  const terms = text.match(/[\u4e00-\u9fa5A-Za-z0-9+#.]{2,18}/g) || [];
  const stopWords = new Set([
    "岗位职责",
    "任职要求",
    "工作职责",
    "优先",
    "以上",
    "相关",
    "熟悉",
    "掌握",
    "具备",
    "能力",
    "经验",
    "负责",
    "参与",
    "完成",
    "我们",
    "公司",
    "团队",
  ]);
  return unique(
    terms.filter((term) => {
      if (stopWords.has(term)) return false;
      if (/^\d+$/.test(term)) return false;
      return term.length >= 2 && term.length <= 18;
    })
  ).slice(0, 18);
};

export const extractJobAreas = (jobDescription: string, jobTitle?: string) => {
  const known = extractKnownKeywords(jobDescription);
  const soft = extractSoftKeywords(jobDescription);
  const terms = extractChineseTerms(`${jobTitle || ""}\n${jobDescription}`);
  return unique([...known, ...soft, ...terms]).slice(0, 12);
};

const splitSentences = (text: string) =>
  normalizeText(text)
    .split(/[\n。；;]+/)
    .map((line) => line.replace(/^[-*•\d.\s]+/, "").trim())
    .filter((line) => line.length >= 8);

export const resumeToText = (resume?: ResumeData | null) => {
  if (!resume) return "";

  const lines: string[] = [];
  const basic = resume.basic;
  lines.push(`姓名：${basic.name || ""}`);
  lines.push(`求职方向：${basic.title || ""}`);
  lines.push(`城市：${basic.location || ""}`);
  lines.push(`邮箱：${basic.email || ""}`);
  lines.push(`电话：${basic.phone || ""}`);

  if (resume.education?.length) {
    lines.push("\n教育经历：");
    resume.education
      .filter((item) => item.visible !== false)
      .forEach((item) => {
        lines.push(
          `${item.school || ""} ${item.major || ""} ${item.degree || ""} ${item.startDate || ""}-${item.endDate || ""}`
        );
        if (item.description) lines.push(item.description);
      });
  }

  if (resume.experience?.length) {
    lines.push("\n工作经历：");
    resume.experience
      .filter((item) => item.visible !== false)
      .forEach((item) => {
        lines.push(`${item.company || ""} ${item.position || ""} ${item.date || ""}`);
        if (item.details) lines.push(item.details);
      });
  }

  if (resume.projects?.length) {
    lines.push("\n项目经历：");
    resume.projects
      .filter((item) => item.visible !== false)
      .forEach((item) => {
        lines.push(`${item.name || ""} ${item.role || ""} ${item.date || ""}`);
        if (item.description) lines.push(item.description);
      });
  }

  if (resume.skillContent) lines.push(`\n技能：\n${resume.skillContent}`);
  if (resume.selfEvaluationContent) lines.push(`\n自我评价：\n${resume.selfEvaluationContent}`);

  Object.values(resume.customData || {}).forEach((items) => {
    items
      .filter((item) => item.visible !== false)
      .forEach((item) => {
        lines.push(`\n${item.title || ""} ${item.subtitle || ""} ${item.dateRange || ""}`);
        if (item.description) lines.push(item.description);
      });
  });

  return normalizeText(lines.join("\n"));
};

const topResumeClaims = (resumeText: string) => {
  const sentences = splitSentences(resumeText);
  const scored = sentences.map((sentence) => {
    let score = 0;
    if (/[0-9]+/.test(sentence)) score += 3;
    if (/项目|系统|平台|负责|主导|参与|完成|优化|提升|降低|增长|转化|用户|客户/.test(sentence)) score += 2;
    if (extractKnownKeywords(sentence).length) score += 2;
    return { sentence, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .map((item) => item.sentence)
    .slice(0, 8);
};

const detectName = (resumeText: string) => {
  const nameLine = resumeText.match(/(?:姓名|Name)[:：]\s*([^\n]{1,20})/i)?.[1];
  if (nameLine) return nameLine.trim();
  return "";
};

const makeAdvice = (
  resumeText: string,
  jobAreas: string[],
  resumeKeywords: string[],
  jobTitle: string
): PrepAdvice[] => {
  const missing = jobAreas.filter((area) => !includesLoose(resumeText, area)).slice(0, 5);
  const hasNumbers = /[0-9]+/.test(resumeText);
  const hasProjects = /项目|系统|平台|作品|案例/.test(resumeText);
  const hasSummary = /个人优势|自我评价|职业概述|Summary|Profile/i.test(resumeText);

  const advice: PrepAdvice[] = [
    {
      title: "把岗位关键词放进最靠前的摘要",
      priority: "高",
      reason: missing.length
        ? `岗位里反复出现了 ${missing.slice(0, 3).join("、")}，但简历中不够显眼。`
        : "你的简历已经覆盖了一些关键词，但首屏摘要还能更像岗位说明。",
      action: `在开头增加 2-3 行“目标岗位版个人优势”，直接回应 ${jobTitle || "目标岗位"} 的核心要求。`,
      example: `示例：具备 ${unique([...resumeKeywords, ...jobAreas]).slice(0, 3).join("、") || "业务理解、执行落地、复盘优化"} 经验，能独立完成需求拆解、执行推进与结果复盘。`,
    },
    {
      title: "每段经历补一个可量化结果",
      priority: hasNumbers ? "中" : "高",
      reason: hasNumbers ? "简历已有数字，但可以把数字和业务动作绑定得更清楚。" : "缺少数字会让面试官难以判断你的真实贡献。",
      action: "把“做了什么”改成“用了什么方法，解决什么问题，带来什么结果”。",
      example: "示例：将“负责活动运营”改为“负责活动选题、素材排期与数据复盘，推动报名转化率提升 18%”。",
    },
    {
      title: "准备 2 个能被追问的项目故事",
      priority: hasProjects ? "中" : "高",
      reason: hasProjects ? "项目经历是面试官最容易深挖的部分。" : "简历里项目感不足，容易被问成泛泛经历。",
      action: "每个项目按 STAR 写清背景、你的动作、难点取舍、结果和复盘。",
      example: "示例：背景是什么；你负责哪一块；最难的冲突是什么；最后指标或交付物是什么。",
    },
    {
      title: "删掉空泛形容词，换成证据",
      priority: "中",
      reason: "“认真负责、学习能力强”本身可信度低，需要被经历证明。",
      action: "把性格词藏进行为里，用实际协作、推进、复盘案例表达。",
      example: "示例：把“沟通能力强”改为“协调产品、设计和开发对齐验收标准，减少返工”。",
    },
  ];

  if (missing.length) {
    advice.push({
      title: "补齐岗位未覆盖技能",
      priority: "高",
      reason: `当前简历对 ${missing.join("、")} 的覆盖不足。`,
      action: "如果你确实做过，把它们放到技能、项目描述或经历结果里；如果没做过，先准备学习计划和诚实回答。",
      example: `示例：项目描述末尾加“相关工具/方法：${missing.slice(0, 3).join("、")}”。`,
    });
  }

  if (!hasSummary) {
    advice.push({
      title: "新增个人优势模块",
      priority: "中",
      reason: "零电脑经验用户最容易把简历写成流水账，摘要可以帮 HR 先抓重点。",
      action: "用三条短句概括岗位匹配、关键能力、可证明成果。",
      example: "示例：1 年运营执行经验；熟悉内容排期与数据复盘；曾独立推进从策划到落地的完整流程。",
    });
  }

  return advice.slice(0, 6);
};

const makeRewrittenResume = (input: GeneratePrepInput, jobAreas: string[], claims: string[]) => {
  const name = detectName(input.resumeText);
  const target = input.jobTitle || "目标岗位";
  const company = input.company ? ` - ${input.company}` : "";
  const strengths = unique([...extractKnownKeywords(input.resumeText), ...jobAreas]).slice(0, 8);
  const claimLines = claims.length ? claims : splitSentences(input.resumeText).slice(0, 6);

  return normalizeText(`
# ${name || "候选人"}｜${target}${company}

## 目标岗位版个人优势
- 围绕 ${target} 的要求，突出 ${strengths.slice(0, 4).join("、") || "岗位理解、执行落地、沟通协作和结果复盘"}。
- 能把经历拆成“问题 - 动作 - 结果”，便于 HR 和面试官快速判断匹配度。
- 对岗位说明中的 ${jobAreas.slice(0, 4).join("、") || "关键能力"} 已准备对应案例，可在面试中展开。

## 核心能力
${strengths.length ? strengths.map((item) => `- ${item}`).join("\n") : "- 请在这里补充与岗位最相关的 4-6 个技能或工具。"}

## 经历改写示例
${claimLines
  .slice(0, 6)
  .map((claim) => {
    const clean = claim.replace(/^[-*•\d.\s]+/, "").trim();
    return `- ${clean}；建议补充量化结果、协作对象和复盘结论，让它更贴近 ${target}。`;
  })
  .join("\n")}

## 投递前检查
- 每段经历至少保留 1 个动作动词：负责、主导、推进、优化、协同、搭建、分析。
- 每个重点项目准备 1 个可追问细节：为什么这样做、遇到什么冲突、指标如何变化。
- 如果岗位关键词你没有做过，不要硬编；改成“了解基础 + 正在补齐 + 可迁移经验”。`);
};

const answerGuideFor = (area: string, level: PrepLevel, set: "JD" | "CV") => {
  const prefix = set === "JD" ? "先讲通用原理，再结合自己的经历落地。" : "先复述简历里的事实，再补充决策、取舍和结果。";
  const depth =
    level === "入门"
      ? "回答时用 3 点结构：概念、做法、例子。"
      : level === "核心"
        ? "回答时补充边界条件、失败风险和可量化结果。"
        : "回答时展示系统性：权衡方案、资源限制、复盘和下一步优化。";
  return `${prefix}${depth}围绕“${area}”准备一个 60 秒版本和一个 3 分钟版本，避免只背定义。`;
};

const makeQuestion = (
  set: "JD" | "CV",
  category: string,
  level: PrepLevel,
  area: string,
  question: string,
  why: string,
  followups: string[]
): PrepQuestion => ({
  id: stableId(`${set}:${category}:${level}:${question}`),
  set,
  category,
  level,
  question,
  why,
  followups,
  answerGuide: answerGuideFor(area, level, set),
});

const makeQuestions = (jobAreas: string[], claims: string[], jobTitle: string): PrepQuestion[] => {
  const jdAreas = (jobAreas.length ? jobAreas : FALLBACK_AREAS).slice(0, 10);
  const cvClaims = claims.length ? claims : ["你简历中最重要的一段经历", "你最能代表能力的项目", "一次遇到问题后的复盘"];
  const questions: PrepQuestion[] = [];

  jdAreas.slice(0, 5).forEach((area, index) => {
    questions.push(
      makeQuestion(
        "JD",
        "岗位要求基础",
        index < 2 ? "入门" : "核心",
        area,
        `你怎么理解 ${jobTitle || "这个岗位"} 中的「${area}」？实际工作中它解决什么问题？`,
        `JD: 要求 ${area}，先确认候选人是否理解岗位基础能力。`,
        [
          `你过去在哪个场景用到过 ${area}？`,
          "如果资源或时间很紧，你会先做哪一步？",
          "怎么判断这件事做得好不好？",
        ]
      )
    );
  });

  jdAreas.slice(5, 10).forEach((area, index) => {
    questions.push(
      makeQuestion(
        "JD",
        "工具方法与岗位匹配",
        index < 2 ? "核心" : "进阶",
        area,
        `如果让你用 ${area} 支撑 ${jobTitle || "目标岗位"} 的日常工作，你会怎么设计流程？`,
        `JD: ${area} 是岗位能力或工具线索，需要考察迁移能力。`,
        [
          "这个流程里最容易出错的环节是什么？",
          "你会怎么和同事或上级同步进展？",
          "如果结果没有达到预期，你怎么复盘？",
        ]
      )
    );
  });

  cvClaims.slice(0, 6).forEach((claim, index) => {
    const shortClaim = claim.length > 34 ? `${claim.slice(0, 34)}...` : claim;
    questions.push(
      makeQuestion(
        "CV",
        "简历项目深挖",
        index < 2 ? "入门" : index < 4 ? "核心" : "进阶",
        shortClaim,
        `你简历里提到「${shortClaim}」，请按背景、你的动作、结果和复盘讲一遍。`,
        "CV: 来自候选人自己的经历，面试官会验证真实性和个人贡献。",
        [
          "这件事里你个人负责的部分是什么？",
          "有没有遇到冲突、延期或失败？你怎么处理？",
          "如果再做一次，你会改哪里？",
        ]
      )
    );
  });

  cvClaims.slice(0, 4).forEach((claim, index) => {
    const shortClaim = claim.length > 28 ? `${claim.slice(0, 28)}...` : claim;
    questions.push(
      makeQuestion(
        "CV",
        "能力证据与反追问",
        index < 2 ? "核心" : "进阶",
        shortClaim,
        `围绕「${shortClaim}」，你能给出一个最能证明你胜任 ${jobTitle || "目标岗位"} 的细节吗？`,
        "CV: 用细节确认候选人的真实深度，避免只有口号。",
        [
          "这个细节为什么重要？",
          "你怎么量化它的结果？",
          "和其他同学或同事相比，你的贡献差异在哪里？",
        ]
      )
    );
  });

  questions.push(
    makeQuestion(
      "JD",
      "进阶场景题",
      "进阶",
      jobTitle || "目标岗位",
      `入职后 30 天内，如果要快速证明你适合 ${jobTitle || "这个岗位"}，你会做哪三件事？`,
      "JD: 考察岗位理解、优先级和落地计划。",
      ["你需要哪些信息才能开始？", "你怎么定义第一个月的成功？", "如果方向判断错了怎么办？"]
    ),
    makeQuestion(
      "CV",
      "进阶场景题",
      "进阶",
      "个人复盘",
      "请讲一次你做得不够好的经历。你当时怎么补救，后来改变了什么？",
      "CV: 面试官常用失败复盘判断成熟度和学习能力。",
      ["你有没有主动承担责任？", "复盘后有没有形成固定方法？", "这件事对你后来的工作有什么影响？"]
    )
  );

  return questions.slice(0, 24);
};

export const generateLocalInterviewPrep = (input: GeneratePrepInput): InterviewPrepResult => {
  const resumeText = normalizeText(input.resumeText);
  const jobDescription = normalizeText(input.jobDescription);
  const jobTitle = input.jobTitle?.trim() || "目标岗位";
  const company = input.company?.trim() || "";
  const jobAreas = extractJobAreas(jobDescription, jobTitle);
  const resumeKeywords = extractKnownKeywords(resumeText);
  const claims = topResumeClaims(resumeText);
  const advice = makeAdvice(resumeText, jobAreas, resumeKeywords, jobTitle);
  const questions = makeQuestions(jobAreas, claims, jobTitle);
  const memoryNotes = unique([
    ...(input.memoryNotes || []),
    `最近准备岗位：${company ? `${company} ` : ""}${jobTitle}`,
    jobAreas.length ? `常见岗位关键词：${jobAreas.slice(0, 6).join("、")}` : "",
    claims[0] ? `简历重点经历：${claims[0].slice(0, 60)}` : "",
  ]).slice(0, 8);

  return {
    id: stableId(`${Date.now()}:${resumeText.slice(0, 120)}:${jobDescription.slice(0, 120)}`),
    createdAt: new Date().toISOString(),
    jobTitle,
    company,
    resumeName: input.resumeName?.trim() || "上传简历",
    resumeText,
    jobDescription,
    advice,
    rewrittenResume: makeRewrittenResume(input, jobAreas, claims),
    coverage: {
      jd: jobAreas.length ? jobAreas : FALLBACK_AREAS,
      cv: claims.length ? claims.slice(0, 8) : ["简历原文", "项目/经历", "技能与自我评价"],
    },
    questions,
    memoryNotes,
    source: "local",
  };
};

export const buildInterviewPrepPrompt = (input: GeneratePrepInput) => {
  const localDraft = generateLocalInterviewPrep(input);
  return `你是一个专业的中文求职教练和面试官。请基于候选人简历和目标岗位，输出个性化简历改造建议、岗位定向润色版简历、以及从入门到进阶的面试题和答案提示。

请沿用 prepme 的方法：
1. JD 半区：从岗位 JD 提取可迁移的通用能力、工具、方法、业务理解，不要编公司内部细节。
2. CV 半区：从候选人简历提取真实经历、项目、技能和成果，问题要能验证真实性。
3. 每题标注 入门/核心/进阶，给 2-4 个追问，并写一段答案提示。
4. 不要编造候选人没有提供的经历；可以用“建议补充”表达缺失信息。

只输出合法 JSON，不要 Markdown，不要解释，字段结构必须是：
{
  "advice": [
    { "title": "", "priority": "高|中|低", "reason": "", "action": "", "example": "" }
  ],
  "rewrittenResume": "",
  "coverage": { "jd": [""], "cv": [""] },
  "questions": [
    {
      "set": "JD|CV",
      "category": "",
      "level": "入门|核心|进阶",
      "question": "",
      "why": "",
      "followups": [""],
      "answerGuide": ""
    }
  ],
  "memoryNotes": [""]
}

候选人历史记忆：
${(input.memoryNotes || []).join("\n") || "暂无"}

目标岗位：${input.jobTitle || "未填写"}
目标公司：${input.company || "未填写"}

岗位描述：
${input.jobDescription}

候选人简历：
${input.resumeText}

本地草稿可参考但不要照抄：
${JSON.stringify({
  advice: localDraft.advice,
  coverage: localDraft.coverage,
  sampleQuestions: localDraft.questions.slice(0, 8),
})}`;
};

const asStringArray = (value: unknown) =>
  Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];

export const parseInterviewPrepAIResult = (
  raw: unknown,
  input: GeneratePrepInput
): InterviewPrepResult | null => {
  const data = typeof raw === "string" ? parseJsonLike(raw) : raw;
  if (!data || typeof data !== "object") return null;

  const source = data as Record<string, any>;
  const local = generateLocalInterviewPrep(input);
  const questions = Array.isArray(source.questions)
    ? source.questions
        .map((item: Record<string, any>) => {
          const question = String(item.question || "").trim();
          if (!question) return null;
          const set = item.set === "CV" ? "CV" : "JD";
          const level: PrepLevel =
            item.level === "进阶" || item.level === "核心" || item.level === "入门"
              ? item.level
              : "核心";
          const category = String(item.category || (set === "JD" ? "岗位要求基础" : "简历项目深挖"));
          return {
            id: stableId(`${set}:${category}:${level}:${question}`),
            set,
            category,
            level,
            question,
            why: String(item.why || ""),
            followups: asStringArray(item.followups).slice(0, 4),
            answerGuide: String(item.answerGuide || answerGuideFor(category, level, set)),
          } satisfies PrepQuestion;
        })
        .filter(Boolean) as PrepQuestion[]
    : [];

  const advice = Array.isArray(source.advice)
    ? source.advice
        .map((item: Record<string, any>) => ({
          title: String(item.title || "").trim(),
          priority:
            item.priority === "高" || item.priority === "中" || item.priority === "低"
              ? item.priority
              : "中",
          reason: String(item.reason || ""),
          action: String(item.action || ""),
          example: String(item.example || ""),
        }))
        .filter((item) => item.title)
    : [];

  return {
    ...local,
    id: stableId(`${Date.now()}:ai:${input.resumeText.slice(0, 120)}:${input.jobDescription.slice(0, 120)}`),
    advice: advice.length ? advice.slice(0, 8) : local.advice,
    rewrittenResume: normalizeText(String(source.rewrittenResume || local.rewrittenResume)),
    coverage: {
      jd: asStringArray(source.coverage?.jd).length ? asStringArray(source.coverage?.jd) : local.coverage.jd,
      cv: asStringArray(source.coverage?.cv).length ? asStringArray(source.coverage?.cv) : local.coverage.cv,
    },
    questions: questions.length ? questions.slice(0, 30) : local.questions,
    memoryNotes: unique([...asStringArray(source.memoryNotes), ...local.memoryNotes]).slice(0, 10),
    source: "ai",
  };
};

export const parseJsonLike = (content: string) => {
  const text = content.trim();
  try {
    return JSON.parse(text);
  } catch {}

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {}
  }

  const objectBlock = text.match(/\{[\s\S]*\}/);
  if (objectBlock?.[0]) {
    try {
      return JSON.parse(objectBlock[0]);
    } catch {}
  }

  return null;
};

export const groupQuestionsByCategory = (questions: PrepQuestion[]) => {
  const groups = new Map<string, PrepQuestion[]>();
  questions.forEach((question) => {
    const key = question.category || "面试题";
    groups.set(key, [...(groups.get(key) || []), question]);
  });
  return Array.from(groups.entries()).map(([category, items]) => ({ category, items }));
};
