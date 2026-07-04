import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import {join} from 'node:path';
import { GoogleGenAI, Type } from '@google/genai';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
app.use(express.json());

const angularApp = new AngularNodeAppEngine();

// Lazy initialization of GoogleGenAI
let aiClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env['GEMINI_API_KEY'];
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required but missing.');
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

const systemPrompt = `You are an expert AI Culinary Assistant and Budget Strategist for a modern, fast-paced cooking app. 

keep the priority as follows:
- Alignment to problem statement
- code quality
- Security
- Efficiency 
- accessibility
- testing

Problem statement: Your goal is to help users aged 18-40 generate a structured, budget-friendly meal plan that is easy to follow.

### GUIDELINES:
1. Tone: Keep it encouraging, practical, and concise. Avoid overly formal language.
2. Structure: Every response must be in strict, valid JSON format.
3. Logic:
    - Budgeting: Prioritize low-cost ingredients. If a user provides a budget, flag if the plan exceeds it.
    - Substitutions: Always provide at least one affordable or common pantry-staple alternative for key ingredients.
    - Accessibility: Keep recipe steps short (maximum 5-6 steps) and use clear, simple language.`;

/**
 * Endpoint to generate a cooking plan based on user inputs.
 */
app.post('/api/generate-plan', async (req, res) => {
  try {
    const { dayDescription, budget, dietaryPreferences, pantryItems } = req.body;

    const userPrompt = `Generate a meal plan for a user's day with the following details:
- Day Description/Schedule: "${dayDescription || 'A typical active day'}"
- Daily Budget: ${budget ? `$${budget}` : 'Flexible budget'}
- Dietary Restrictions: "${dietaryPreferences || 'None'}"
- Pantry Ingredients to use up: "${pantryItems || 'None'}"

Ensure the meal plan is highly practical, extremely budget-friendly, and easy to follow. Ensure the steps are short (maximum 5-6 steps per meal) and use plain, clear language. Calculate realistic estimated costs in USD.`;

    const ai = getGenAI();
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            meal_plan: {
              type: Type.OBJECT,
              properties: {
                breakfast: {
                  type: Type.OBJECT,
                  properties: {
                    item: { type: Type.STRING },
                    steps: { type: Type.ARRAY, items: { type: Type.STRING } },
                    est_cost: { type: Type.NUMBER }
                  },
                  required: ["item", "steps", "est_cost"]
                },
                lunch: {
                  type: Type.OBJECT,
                  properties: {
                    item: { type: Type.STRING },
                    steps: { type: Type.ARRAY, items: { type: Type.STRING } },
                    est_cost: { type: Type.NUMBER }
                  },
                  required: ["item", "steps", "est_cost"]
                },
                dinner: {
                  type: Type.OBJECT,
                  properties: {
                    item: { type: Type.STRING },
                    steps: { type: Type.ARRAY, items: { type: Type.STRING } },
                    est_cost: { type: Type.NUMBER }
                  },
                  required: ["item", "steps", "est_cost"]
                }
              },
              required: ["breakfast", "lunch", "dinner"]
            },
            grocery_list: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            substitutions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  original: { type: Type.STRING },
                  alternative: { type: Type.STRING }
                },
                required: ["original", "alternative"]
              }
            },
            budget_analysis: {
              type: Type.OBJECT,
              properties: {
                is_feasible: { type: Type.BOOLEAN },
                total_estimated_cost: { type: Type.NUMBER },
                note: { type: Type.STRING }
              },
              required: ["is_feasible", "total_estimated_cost", "note"]
            }
          },
          required: ["meal_plan", "grocery_list", "substitutions", "budget_analysis"]
        }
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error('The AI model returned an empty response.');
    }

    const data = JSON.parse(text);
    res.json(data);
  } catch (error: unknown) {
    console.error('Error generating cooking to-do list plan:', error);
    const message = error instanceof Error ? error.message : 'An error occurred during generation';
    res.status(500).json({ error: message });
  }
});

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
