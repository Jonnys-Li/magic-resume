import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Brain,
  CheckCircle2,
  ClipboardList,
  Download,
  FileText,
  History,
  Loader2,
  RefreshCw,
  Sparkles,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAIConfigStore } from "@/store/useAIConfigStore";
import { useInterviewPrepStore } from "@/store/useInterviewPrepStore";
import { useResumeStore } from "@/store/useResumeStore";
import {
  generateLocalInterviewPrep,
  groupQuestionsByCategory,
  normalizeText,
  parseJsonLike,
  resumeToText,
  type InterviewPrepResult,
} from "@/lib/interviewPrep";
import type { AIModelType } from "@/config/ai";
import type { ResumeData } from "@/types/resume";
import { cn } from "@/lib/utils";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

const CUSTOM_RESUME = "custom";

const levelStyles: Record<string, string> = {
  入门: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900",
  核心: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900",
  进阶: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900",
};

const escapeHtml = (value: string) =>
  String(value || "").replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return map[char] || char;
  });

const buildPdfDocument = (title: string, content: string) => `
  <div style="font-family: 'Noto Sans SC', 'Microsoft YaHei', Arial, sans-serif; color: #1f2937; padding: 24px; line-height: 1.7;">
    <style>
      h1 { font-size: 24px; margin: 0 0 16px; }
      h2 { font-size: 17px; margin: 22px 0 8px; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb; }
      h3 { font-size: 14px; margin: 14px 0 6px; }
      p { margin: 8px 0; }
      ul { margin: 8px 0 12px 20px; padding: 0; }
      li { margin: 4px 0; }
      .chip { display: inline-block; border: 1px solid #e5e7eb; border-radius: 999px; padding: 2px 8px; font-size: 11px; margin-right: 6px; color: #4b5563; }
      .question { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin: 10px 0; break-inside: avoid; }
      .muted { color: #6b7280; font-size: 12px; }
    </style>
    <h1>${escapeHtml(title)}</h1>
    ${content}
  </div>
`;

const downloadText = (filename: string, content: string, type = "text/plain") => {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const exportHtmlToPdf = async (filename: string, html: string) => {
  const module = await import("html2pdf.js");
  const html2pdf = (module as any).default || module;
  const container = document.createElement("div");
  container.innerHTML = html;
  container.style.background = "#ffffff";
  container.style.width = "794px";
  document.body.appendChild(container);

  try {
    await html2pdf()
      .set({
        margin: [8, 8, 8, 8],
        filename,
        image: { type: "jpeg", quality: 0.96 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["avoid-all", "css", "legacy"] },
      })
      .from(container)
      .save();
  } finally {
    document.body.removeChild(container);
  }
};

const getAIRequestConfig = (config: ReturnType<typeof useAIConfigStore.getState>) => {
  const modelType = config.selectedModel;
  if (modelType === "doubao") {
    return {
      modelType,
      apiKey: config.doubaoApiKey,
      model: config.doubaoModelId,
    };
  }
  if (modelType === "deepseek") {
    return {
      modelType,
      apiKey: config.deepseekApiKey,
      model: config.deepseekModelId || "deepseek-chat",
    };
  }
  if (modelType === "openai") {
    return {
      modelType,
      apiKey: config.openaiApiKey,
      model: config.openaiModelId,
      apiEndpoint: config.openaiApiEndpoint,
    };
  }
  return {
    modelType: "gemini" as AIModelType,
    apiKey: config.geminiApiKey,
    model: config.geminiModelId,
  };
};

const parseResumeFile = async (file: File) => {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".pdf")) {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const typedPdfjs = pdfjs as any;
    typedPdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    const buffer = await file.arrayBuffer();
    const pdf = await typedPdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 8); pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item: any) => ("str" in item ? item.str : ""))
        .join(" ");
      pages.push(pageText);
    }

    return normalizeText(pages.join("\n"));
  }

  const raw = await file.text();
  if (lowerName.endsWith(".json")) {
    const parsed = parseJsonLike(raw);
    if (parsed && typeof parsed === "object" && "basic" in parsed) {
      return resumeToText(parsed as ResumeData);
    }
    return normalizeText(JSON.stringify(parsed || raw, null, 2));
  }

  return normalizeText(raw);
};

const questionsPdfContent = (result: InterviewPrepResult) => {
  const groups = groupQuestionsByCategory(result.questions);
  return groups
    .map(
      (group) => `
        <h2>${escapeHtml(group.category)}</h2>
        ${group.items
          .map(
            (question, index) => `
              <div class="question">
                <div>
                  <span class="chip">${escapeHtml(question.set)}</span>
                  <span class="chip">${escapeHtml(question.level)}</span>
                </div>
                <h3>${index + 1}. ${escapeHtml(question.question)}</h3>
                <p class="muted">${escapeHtml(question.why)}</p>
                <p><strong>追问：</strong></p>
                <ul>${question.followups
                  .map((followup) => `<li>${escapeHtml(followup)}</li>`)
                  .join("")}</ul>
              </div>`
          )
          .join("")}
      `
    )
    .join("");
};

const answersPdfContent = (result: InterviewPrepResult) =>
  result.questions
    .map(
      (question, index) => `
        <div class="question">
          <div>
            <span class="chip">${escapeHtml(question.set)}</span>
            <span class="chip">${escapeHtml(question.level)}</span>
          </div>
          <h2>${index + 1}. ${escapeHtml(question.question)}</h2>
          <p><strong>最佳回答思路：</strong>${escapeHtml(question.answerGuide)}</p>
          <p><strong>追问处理：</strong></p>
          <ul>${question.followups
            .map(
              (followup) =>
                `<li>${escapeHtml(followup)}：先给结论，再补充一个来自简历或岗位的例子。</li>`
            )
            .join("")}</ul>
        </div>
      `
    )
    .join("");

export default function InterviewPrepPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { resumes } = useResumeStore();
  const aiConfig = useAIConfigStore();
  const {
    clientId,
    records,
    addRecord,
    setRecordsFromCloud,
    deleteRecord,
    clearRecords,
    getMemoryNotes,
  } = useInterviewPrepStore();

  const resumeOptions = useMemo(
    () =>
      Object.entries(resumes).sort(([, a], [, b]) => {
        const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return bTime - aTime;
      }),
    [resumes]
  );

  const [selectedResumeId, setSelectedResumeId] = useState(CUSTOM_RESUME);
  const [resumeTextValue, setResumeTextValue] = useState("");
  const [resumeName, setResumeName] = useState("上传简历");
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [hasMounted, setHasMounted] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [result, setResult] = useState<InterviewPrepResult | null>(null);
  const [cloudStorageLabel, setCloudStorageLabel] = useState("本地记忆");

  const memoryNotes = useMemo(() => getMemoryNotes(), [records, getMemoryNotes]);
  const aiReady = aiConfig.isConfigured();

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    if (!records.length) return;
    setResult((current) => current || records[0]);
  }, [records]);

  useEffect(() => {
    const syncHistory = async () => {
      try {
        const response = await fetch(
          `/api/interview-history?clientId=${encodeURIComponent(clientId)}`
        );
        if (!response.ok) return;
        const data = await response.json();
        if (Array.isArray(data.records)) {
          setRecordsFromCloud(data.records);
        }
        setCloudStorageLabel(data.storage === "d1" ? "D1 云端记忆" : "本地记忆");
      } catch {
        setCloudStorageLabel("本地记忆");
      }
    };

    syncHistory();
  }, [clientId, setRecordsFromCloud]);

  useEffect(() => {
    if (selectedResumeId === CUSTOM_RESUME) return;
    const resume = resumes[selectedResumeId];
    if (!resume) return;
    setResumeTextValue(resumeToText(resume));
    setResumeName(resume.title || resume.basic?.name || "已有简历");
  }, [selectedResumeId, resumes]);

  const saveRecord = async (record: InterviewPrepResult) => {
    addRecord(record);
    setResult(record);

    try {
      const response = await fetch("/api/interview-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, record }),
      });
      const data = await response.json().catch(() => null);
      setCloudStorageLabel(data?.storage === "d1" ? "D1 云端记忆" : "本地记忆");
    } catch {
      setCloudStorageLabel("本地记忆");
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      setIsReadingFile(true);
      const text = await parseResumeFile(file);
      if (!text) {
        toast.error("没有读到简历文字。扫描版 PDF 可先在“我的简历”里用 Gemini 导入。");
        return;
      }
      setSelectedResumeId(CUSTOM_RESUME);
      setResumeTextValue(text);
      setResumeName(file.name.replace(/\.[^.]+$/, ""));
      toast.success("简历已读取，可以填写岗位信息了");
    } catch (error) {
      console.error("Resume file parse error:", error);
      toast.error("读取失败，请换 PDF/TXT/MD/JSON，或直接粘贴简历文字");
    } finally {
      setIsReadingFile(false);
    }
  };

  const generatePrep = async (preferAI: boolean) => {
    const cleanResume = normalizeText(resumeTextValue);
    const cleanJob = normalizeText(jobDescription);

    if (!cleanResume) {
      toast.error("请先上传、选择或粘贴简历内容");
      return;
    }
    if (!cleanJob && !jobTitle.trim()) {
      toast.error("请填写目标岗位，最好再粘贴岗位 JD");
      return;
    }

    const input = {
      resumeText: cleanResume,
      jobDescription: cleanJob || `${jobTitle} ${company}`,
      jobTitle,
      company,
      resumeName,
      memoryNotes,
    };

    setIsGenerating(true);
    try {
      if (preferAI && aiReady) {
        const aiPayload = getAIRequestConfig(useAIConfigStore.getState());
        const response = await fetch("/api/interview-prep", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...input,
            ...aiPayload,
          }),
        });
        const data = await response.json();
        if (!response.ok || !data.result) {
          throw new Error(data?.error || "AI 生成失败");
        }
        await saveRecord(data.result);
        toast.success("AI 已生成岗位定制方案");
        return;
      }

      const local = generateLocalInterviewPrep(input);
      await saveRecord(local);
      toast.success("已生成本地版方案，可配置 AI 后再增强");
    } catch (error) {
      console.error("Generate prep error:", error);
      const local = generateLocalInterviewPrep(input);
      await saveRecord(local);
      toast.warning("AI 暂不可用，已先生成本地版方案");
    } finally {
      setIsGenerating(false);
    }
  };

  const exportQuestions = async () => {
    if (!result) return;
    await exportHtmlToPdf(
      `${result.jobTitle || "面试题"}-面试题.pdf`,
      buildPdfDocument(
        `${result.company ? `${result.company} ` : ""}${result.jobTitle} 面试题`,
        questionsPdfContent(result)
      )
    );
  };

  const exportAnswers = async () => {
    if (!result) return;
    await exportHtmlToPdf(
      `${result.jobTitle || "面试题"}-答案提示.pdf`,
      buildPdfDocument(
        `${result.company ? `${result.company} ` : ""}${result.jobTitle} 答案提示`,
        answersPdfContent(result)
      )
    );
  };

  const exportRewrittenResume = () => {
    if (!result) return;
    downloadText(
      `${result.resumeName || "resume"}-${result.jobTitle || "岗位"}-润色版.md`,
      result.rewrittenResume,
      "text/markdown"
    );
  };

  if (!hasMounted) {
    return (
      <ScrollArea className="h-[calc(100vh-2rem)] w-full">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
          <div className="space-y-3">
            <div className="h-6 w-44 rounded-md bg-muted" />
            <div className="h-9 w-72 rounded-md bg-muted" />
            <div className="h-4 w-full max-w-2xl rounded-md bg-muted" />
          </div>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div className="space-y-4">
              <Card className="h-[430px] border-border/60 shadow-sm" />
              <Card className="h-[360px] border-border/60 shadow-sm" />
            </div>
            <Card className="min-h-[760px] border-border/60 shadow-sm" />
          </div>
        </div>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className="h-[calc(100vh-2rem)] w-full">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"
        >
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                Prepme 风格面试准备
              </Badge>
              <Badge variant="outline" className="gap-1.5">
                <History className="h-3.5 w-3.5" />
                {cloudStorageLabel}
              </Badge>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-950 dark:text-gray-50">
              岗位定制简历改造台
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              上传简历，粘贴岗位 JD，系统会给出改造意见、润色版简历、面试题 PDF 和答案提示 PDF。没有 AI Key 也能先用本地规则跑通。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={!result}
              onClick={exportQuestions}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              面试题 PDF
            </Button>
            <Button
              variant="outline"
              disabled={!result}
              onClick={exportAnswers}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              答案 PDF
            </Button>
            <Button
              disabled={!result}
              onClick={exportRewrittenResume}
              className="gap-2 bg-gray-900 text-white hover:bg-gray-800 dark:bg-primary dark:text-primary-foreground"
            >
              <FileText className="h-4 w-4" />
              导出润色简历
            </Button>
          </div>
        </motion.div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="space-y-4"
          >
            <Card className="border-border/60 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Upload className="h-5 w-5 text-blue-600" />
                  1. 放入简历
                </CardTitle>
                <CardDescription>
                  可以选择已有简历，也可以上传 PDF/TXT/MD/JSON，扫描版 PDF 建议先在“我的简历”导入。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.md,.markdown,.json,application/pdf,text/plain,application/json"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                  <Select value={selectedResumeId} onValueChange={setSelectedResumeId}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择已有简历" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={CUSTOM_RESUME}>手动上传/粘贴</SelectItem>
                      {resumeOptions.map(([id, resume]) => (
                        <SelectItem key={id} value={id}>
                          {resume.title || resume.basic?.name || "未命名简历"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    className="gap-2"
                    disabled={isReadingFile}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {isReadingFile ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    上传文件
                  </Button>
                </div>
                <Input
                  value={resumeName}
                  onChange={(event) => setResumeName(event.target.value)}
                  placeholder="给这份简历起个名字，比如：张三-运营岗"
                />
                <Textarea
                  value={resumeTextValue}
                  onChange={(event) => {
                    setSelectedResumeId(CUSTOM_RESUME);
                    setResumeTextValue(event.target.value);
                  }}
                  className="min-h-[260px] resize-y font-mono text-xs leading-5"
                  placeholder="也可以直接把简历文字粘贴到这里..."
                />
              </CardContent>
            </Card>

            <Card className="border-border/60 shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ClipboardList className="h-5 w-5 text-emerald-600" />
                  2. 填写岗位
                </CardTitle>
                <CardDescription>
                  岗位描述越完整，问题和简历润色越贴合；没有 JD 也可以先填岗位名称。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    value={jobTitle}
                    onChange={(event) => setJobTitle(event.target.value)}
                    placeholder="目标岗位，例如：产品运营实习生"
                  />
                  <Input
                    value={company}
                    onChange={(event) => setCompany(event.target.value)}
                    placeholder="目标公司，可选"
                  />
                </div>
                <Textarea
                  value={jobDescription}
                  onChange={(event) => setJobDescription(event.target.value)}
                  className="min-h-[220px] resize-y text-sm leading-6"
                  placeholder="粘贴招聘 JD：岗位职责、任职要求、加分项..."
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    className="gap-2 bg-gray-900 text-white hover:bg-gray-800 dark:bg-primary dark:text-primary-foreground"
                    disabled={isGenerating}
                    onClick={() => generatePrep(aiReady)}
                  >
                    {isGenerating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    一键生成
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-2"
                    disabled={isGenerating}
                    onClick={() => generatePrep(false)}
                  >
                    <RefreshCw className="h-4 w-4" />
                    本地快速生成
                  </Button>
                </div>
                {!aiReady && (
                  <Alert className="border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20">
                    <Brain className="h-4 w-4 text-amber-600" />
                    <AlertTitle>当前未配置 AI 服务商</AlertTitle>
                    <AlertDescription>
                      本地规则可以即开即用；到“AI 服务商”配置豆包、DeepSeek、OpenAI 兼容端点或 Gemini 后，生成质量会更像真人求职教练。
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="min-w-0"
          >
            <Card className="min-h-[760px] border-border/60 shadow-sm">
              <CardHeader className="border-b border-border/50">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <CardTitle className="text-lg">生成结果</CardTitle>
                    <CardDescription>
                      {result
                        ? `${result.resumeName}｜${result.company ? `${result.company} ` : ""}${result.jobTitle}｜${result.source === "ai" ? "AI增强" : "本地生成"}`
                        : "等待生成后，这里会出现可导出的完整材料。"}
                    </CardDescription>
                  </div>
                  {result && (
                    <Badge variant="outline" className="w-fit gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      {result.questions.length} 道题
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {!result ? (
                  <div className="flex min-h-[620px] flex-col items-center justify-center gap-3 px-8 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600">
                      <Sparkles className="h-8 w-8" />
                    </div>
                    <div className="max-w-md">
                      <h2 className="text-xl font-semibold">先放简历，再放岗位</h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        生成后会自动保存历史记录。下一次准备同类岗位时，页面会读取上次关键词和薄弱点，越用越贴近你的经历。
                      </p>
                    </div>
                  </div>
                ) : (
                  <Tabs defaultValue="advice" className="p-4 sm:p-5">
                    <TabsList className="grid h-auto w-full grid-cols-2 gap-1 md:grid-cols-4">
                      <TabsTrigger value="advice">改造意见</TabsTrigger>
                      <TabsTrigger value="resume">润色简历</TabsTrigger>
                      <TabsTrigger value="questions">面试题</TabsTrigger>
                      <TabsTrigger value="history">历史记忆</TabsTrigger>
                    </TabsList>

                    <TabsContent value="advice" className="mt-5 space-y-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-lg border border-border/60 p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            JD 覆盖
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {result.coverage.jd.map((item) => (
                              <Badge key={item} variant="secondary">
                                {item}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <div className="rounded-lg border border-border/60 p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            简历覆盖
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {result.coverage.cv.slice(0, 8).map((item) => (
                              <Badge key={item} variant="outline" className="max-w-full truncate">
                                {item.length > 28 ? `${item.slice(0, 28)}...` : item}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-3">
                        {result.advice.map((item, index) => (
                          <div
                            key={`${item.title}-${index}`}
                            className="rounded-lg border border-border/60 bg-card p-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <h3 className="font-semibold">{item.title}</h3>
                                <p className="mt-1 text-sm text-muted-foreground">{item.reason}</p>
                              </div>
                              <Badge
                                variant="outline"
                                className={cn(
                                  item.priority === "高" &&
                                    "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300",
                                  item.priority === "中" &&
                                    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300",
                                  item.priority === "低" &&
                                    "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                                )}
                              >
                                {item.priority}优先级
                              </Badge>
                            </div>
                            <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                              <div className="rounded-md bg-muted/50 p-3">
                                <p className="font-medium">怎么改</p>
                                <p className="mt-1 text-muted-foreground">{item.action}</p>
                              </div>
                              <div className="rounded-md bg-muted/50 p-3">
                                <p className="font-medium">参考写法</p>
                                <p className="mt-1 text-muted-foreground">{item.example}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </TabsContent>

                    <TabsContent value="resume" className="mt-5">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm text-muted-foreground">
                          这是岗位定向版本，建议再复制到简历编辑器里做排版和细节确认。
                        </p>
                        <Button variant="outline" size="sm" className="gap-2" onClick={exportRewrittenResume}>
                          <Download className="h-4 w-4" />
                          下载 Markdown
                        </Button>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
                        <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7">
                          {result.rewrittenResume}
                        </pre>
                      </div>
                    </TabsContent>

                    <TabsContent value="questions" className="mt-5 space-y-5">
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" className="gap-2" onClick={exportQuestions}>
                          <Download className="h-4 w-4" />
                          导出面试题 PDF
                        </Button>
                        <Button variant="outline" size="sm" className="gap-2" onClick={exportAnswers}>
                          <Download className="h-4 w-4" />
                          导出答案 PDF
                        </Button>
                      </div>
                      {groupQuestionsByCategory(result.questions).map((group) => (
                        <div key={group.category} className="space-y-3">
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold text-muted-foreground">
                              {group.category}
                            </h3>
                            <Badge variant="outline">{group.items.length}</Badge>
                          </div>
                          {group.items.map((question) => (
                            <div
                              key={question.id}
                              className="rounded-lg border border-border/60 bg-card p-4"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline">{question.set}</Badge>
                                <span
                                  className={cn(
                                    "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                                    levelStyles[question.level]
                                  )}
                                >
                                  {question.level}
                                </span>
                              </div>
                              <h4 className="mt-3 font-semibold leading-7">{question.question}</h4>
                              <p className="mt-2 text-sm text-muted-foreground">{question.why}</p>
                              <div className="mt-3 rounded-md bg-muted/40 p-3">
                                <p className="text-sm font-medium">可能追问</p>
                                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                                  {question.followups.map((followup) => (
                                    <li key={followup}>- {followup}</li>
                                  ))}
                                </ul>
                              </div>
                              <div className="mt-3 rounded-md border border-border/60 p-3 text-sm">
                                <p className="font-medium">答案提示</p>
                                <p className="mt-1 text-muted-foreground">{question.answerGuide}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </TabsContent>

                    <TabsContent value="history" className="mt-5 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="font-semibold">使用记忆</h3>
                          <p className="text-sm text-muted-foreground">
                            历史会保存在浏览器；部署并绑定 Cloudflare D1 后，也会写入数据库。
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            clearRecords();
                            setResult(null);
                            toast.success("本地历史已清空");
                          }}
                        >
                          清空本地历史
                        </Button>
                      </div>
                      <div className="rounded-lg border border-border/60 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          这次生成读取到的记忆
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {memoryNotes.length ? (
                            memoryNotes.map((note) => (
                              <Badge key={note} variant="secondary" className="max-w-full truncate">
                                {note.length > 42 ? `${note.slice(0, 42)}...` : note}
                              </Badge>
                            ))
                          ) : (
                            <p className="text-sm text-muted-foreground">暂无记忆，生成一次后会自动积累。</p>
                          )}
                        </div>
                      </div>
                      <div className="space-y-3">
                        {records.map((record) => (
                          <div
                            key={record.id}
                            className={cn(
                              "flex flex-col gap-3 rounded-lg border border-border/60 p-4 md:flex-row md:items-center md:justify-between",
                              record.id === result.id && "border-primary/40 bg-primary/5"
                            )}
                          >
                            <div>
                              <p className="font-medium">
                                {record.company ? `${record.company} ` : ""}
                                {record.jobTitle}
                              </p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {record.resumeName}｜{new Date(record.createdAt).toLocaleString()}｜{record.questions.length} 题
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Button variant="outline" size="sm" onClick={() => setResult(record)}>
                                查看
                              </Button>
                              <Button variant="outline" size="sm" onClick={() => deleteRecord(record.id)}>
                                删除
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </TabsContent>
                  </Tabs>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </ScrollArea>
  );
}
