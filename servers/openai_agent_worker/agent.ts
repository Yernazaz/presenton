import { Agent, AgentInputItem, Runner, withTrace } from "@openai/agents";
import { z } from "zod";
import dotenv from "dotenv";
import express from "express";

// Load environment variables
dotenv.config();

const app = express();
app.use(express.json());

const MyAgentSchema = z.object({ 
  action: z.enum(["search", "generate"]).describe("Whether to search for existing images or generate new ones"),
  search_query: z.string().optional().describe("Semantic search query (2-5 keywords) if action is 'search'"),
  search_query_en: z
    .string()
    .optional()
    .describe("English semantic search query (2-5 keywords) if action is 'search'")
});

// Multi-language agent prompts
const AGENT_PROMPTS: Record<string, string> = {
  "English": `You are an intelligent agent for classifying image requests.

YOUR TASK: determine action and generate search_query.

📋 CLASSIFICATION RULES:

✅ **SEARCH** (action: "search") - for objective, factual content:
- Formulas (chemical, mathematical, physical)
- Data diagrams (Punnett square, Krebs cycle, mitosis)
- Process schemes (photosynthesis, electrical circuits)
- Biological structures (DNA, cells, organs)
- Geographic maps, historical photos
- Real objects (equipment, tools)
- Graphs and tables

🎨 **GENERATE** (action: "generate") - for artistic content:
- Artistic illustrations
- Abstract concepts (love, success)
- Fantastical scenes
- Decorative elements

🔍 **SEMANTIC QUERY:**
For "search" - create a SHORT query (2-5 keywords in English):

Examples:
❌ "Educational diagram of DNA structure"
✅ "DNA double helix"

❌ "Illustration of photosynthesis process"  
✅ "photosynthesis diagram"

IMPORTANT:
- search_query must be in English, short (2-5 words)
- search_query_en must be in English, short (2-5 words)`,

  "Russian (Русский)": `Ты интеллектуальный агент для классификации запросов на изображения.

ТВОЯ ЗАДАЧА: определить action и сгенерировать search_query и search_query_en.

📋 ПРАВИЛА КЛАССИФИКАЦИИ:

✅ **ПОИСК** (action: "search") - для объективного, фактического контента:
- Формулы (химические, математические, физические)
- Диаграммы с данными (решётка Пеннета, цикл Кребса, митоз)
- Схемы процессов (фотосинтез, электрические цепи)
- Биологические структуры (ДНК, клетки, органы)
- Географические карты, исторические фотографии
- Реальные объекты (оборудование, инструменты)
- Графики и таблицы

🎨 **ГЕНЕРАЦИЯ** (action: "generate") - для художественного контента:
- Художественные иллюстрации
- Абстрактные концепции (любовь, успех)
- Фантастические сцены
- Декоративные элементы

🔍 **СЕМАНТИЧЕСКИЙ ЗАПРОС:**
Для "search" - создай КОРОТКИЙ запрос (2-5 ключевых слов на РУССКОМ):

Также укажи search_query_en — короткий (2-5 слов) запрос на АНГЛИЙСКОМ для международных источников.

Примеры:
❌ "Образовательная диаграмма ДНК"
✅ "двойная спираль ДНК"
✅ search_query_en: "DNA double helix"

❌ "Иллюстрация фотосинтеза"
✅ "диаграмма фотосинтеза"
✅ search_query_en: "photosynthesis diagram"

ВАЖНО:
- search_query должен быть на РУССКОМ, коротким (2-5 слов)
- search_query_en должен быть на АНГЛИЙСКОМ, коротким (2-5 слов)`,

  "Kazakh (Қазақша)": `Сен сурет сұрауларын жіктейтін интеллектуалды агентсің.

СЕНІҢ ТАПСЫРМАҢ: action анықтау және search_query және search_query_en генерациялау.

📋 ЖІКТЕУ ЕРЕЖЕЛЕРІ:

✅ **ІЗДЕУ** (action: "search") - объективті, нақтылы мазмұн үшін:
- Формулалар (химиялық, математикалық, физикалық)
- Деректер диаграммалары (Пеннет торы, Кребс циклі, митоз)
- Процесс схемалары (фотосинтез, электр тізбектері)
- Биологиялық құрылымдар (ДНҚ, жасушалар, органдар)
- Географиялық карталар, тарихи фотолар
- Нақты объектілер (жабдықтар, құралдар)
- Графиктер мен кестелер

🎨 **ГЕНЕРАЦИЯ** (action: "generate") - көркем мазмұн үшін:
- Көркем иллюстрациялар
- Абстрактілі ұғымдар (махаббат, табыс)
- Ғажайып сахналар
- Декоративті элементтер

🔍 **СЕМАНТИКАЛЫҚ СҰРАНЫС:**
"search" үшін - ҚЫСҚА сұраныс жаса (2-5 кілт сөз ҚАЗАҚ тілінде):

Сондай-ақ search_query_en бер — халықаралық дереккөздер үшін АҒЫЛШЫН тіліндегі 2-5 сөз.

Мысалдар:
❌ "ДНҚ құрылымының білім беру диаграммасы"
✅ "ДНҚ қос спираль"
✅ search_query_en: "DNA double helix"

❌ "Фотосинтез иллюстрациясы"
✅ "фотосинтез диаграммасы"
✅ search_query_en: "photosynthesis diagram"

МАҢЫЗДЫ:
- search_query ҚАЗАҚ тілінде, қысқа (2-5 сөз) болуы керек
- search_query_en АҒЫЛШЫН тілінде, қысқа (2-5 сөз) болуы керек`
};

function getAgentPrompt(language: string): string {
  const l = (language || "").toLowerCase();
  if (
    l.includes("kazakh") ||
    l.includes("қазақ") ||
    l.includes("қаз") ||
    l.startsWith("kk")
  ) {
    return AGENT_PROMPTS["Kazakh (Қазақша)"];
  }
  if (l.includes("russian") || l.includes("рус") || l.startsWith("ru")) {
    return AGENT_PROMPTS["Russian (Русский)"];
  }
  return AGENT_PROMPTS["English"];
}

const createAgent = (language: string) => new Agent({
  name: "Image Classification Agent",
  instructions: getAgentPrompt(language),
  model: "gpt-5.2",
  tools: [],
  outputType: MyAgentSchema,
  modelSettings: {
    reasoning: {
      effort: "medium",
      summary: "auto"
    },
    store: true
  }
});

type WorkflowInput = { input_as_text: string; language?: string };


// Main code entrypoint
export const runWorkflow = async (workflow: WorkflowInput) => {
  return await withTrace("WonkImage", async () => {
    const agent = createAgent(workflow.language || "English");
    const conversationHistory: AgentInputItem[] = [
      { role: "user", content: [{ type: "input_text", text: workflow.input_as_text }] }
    ];
    const runner = new Runner({
      traceMetadata: {
        __trace_source__: "agent-builder",
        workflow_id: "wf_696e3b8b61d08190860ca36ae1507f8107873a85a90547e9"
      }
    });
    const myAgentResultTemp = await runner.run(
      agent,
      [
        ...conversationHistory
      ]
    );
    conversationHistory.push(...myAgentResultTemp.newItems.map((item) => item.rawItem));

    if (!myAgentResultTemp.finalOutput) {
        throw new Error("Agent result is undefined");
    }

    return myAgentResultTemp.finalOutput;
  });
}

// API Endpoint
app.post("/search", async (req, res) => {
  try {
    const { query, language } = req.body;
    if (!query) {
      return res.status(400).json({ error: "Missing query" });
    }

    console.log(`OpenAI Agent: Classifying '${query}' (language: ${language || 'English'})`);
    const result = await runWorkflow({ input_as_text: query, language: language || "English" });
    
    console.log(`OpenAI Agent Decision: action=${result.action}, search_query=${result.search_query || 'N/A'}`);
    
    // Return classification result
    res.json({ 
      action: result.action,
      search_query: result.search_query,
      search_query_en: (result as any).search_query_en
    });
  } catch (error: any) {
    console.error("OpenAI Agent Error:", error);
    res.status(500).json({ error: error.message || String(error) });
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`OpenAI Agent Worker listening on port ${PORT}`);
});
