# RPG Challenge

A financial document upload pipeline. Users upload documents via a React frontend; the FastAPI backend analyzes them and spins up a Docker container with the files available at `/app/data` for processing. The processing produces a CSV file with the aggregated data from everything.

## Data

There are several caveats to the data:

1. The data for the project is multimodal. It has images, PDFs, text documents, CSV files.
2. The data contains some potentially sensitive PII data, such as account number on the Visa statement
3. The data is unclean:
   1. the `artsupplies.jpeg` is rotated 90 degrees
   2. `chat_gpt.jpg` is an irrelevant picture (a dog at a dog show) — no financial content
   3. `invoices.xlsx` does not format the amount consistently - one row has 1750 without a dollar sign. It does not format dates consistently neither - one row has a "-" instead of a "," in between the month-date pair and the year
   4. the interpretation of the transaction amounts is not always clear - in `Visa_Statement_Q12025.pdf`, what does `TXN-0214-001`with a -40.00$ mean? Is it deducted from the freelancer's account, or is it added to the freelancer's account? I was curious enough to check my own bank account, and negative amounts represent my payments (i.e., *deductions* from my account), but according to `notes.txt`, "adobe plan downgraded feb 14, refund came through (~$40)" means that 40$$ were *added* to the freelancer's account
   5. importantly, in document processing cases, very often your document names might be cryptic (e.g., Scan-10-02-2026) and not match up the actual content. We don't see too much of this except in the name `beg.png`, which is later inferred to be Bureau en Gros, but it is something to note.
   6. data duplication - `notes.txt` refers to the Adobe plan downgrade refund and the Staples toner cartridge refund, both of which appear on the Visa statement
   7. mixed languages — several receipts (parking, pharmacy/Jean Coutu, Bureau en Gros) are entirely in French. Financial vocabulary differs: "Sous-total" = subtotal, "TPS" = GST (5%), "TVQ" = QST (9.975%), "Comptant" = cash, "Monnaie" = change, "Entrée/Sortie" = entry/exit time on parking receipts.
   8. mixed date formats — French receipts use DD/MM/YYYY (e.g. 05/02/2025 = February 5), while other documents may use MM/DD/YYYY or written month names. The locale must be inferred from context to avoid day/month transposition.
   9. tax lines on receipts — receipts show subtotal + TPS + TVQ + total. **Decision: always use the after-tax total amount paid.**
   10. multi-item receipts — some receipts list multiple line items (e.g. Bureau en Gros: colour printing + cardstock). **Decision: record one transaction per receipt using the final total, not individual line items.**
   11. handwritten documents — `artsupplies.jpeg` is a handwritten receipt on lined paper with informal notation (e.g. "Markers (x6) - $18.50"). OCR quality is lower; amounts may need to be summed from line items if the total is unclear.
   12. cash transactions — some receipts are for cash purchases ("PAYé: COMPTANT") and will not appear on any bank or card statement. They should not be expected to have a corresponding Visa entry.
   13. non-business charges mixed in — `notes.txt` flags Petco (dog food, personal) and Netflix (personal) as accidental business card charges. **Decision: include all transactions regardless of business/personal classification; do not attempt to filter.**
   14. future/implied transactions — `notes.txt` mentions outstanding invoices (Greenloop invoice 2, Atelier Nomade) and speculative future work. **Decision: ignore any transaction that has not yet occurred; only record completed transactions.**
   15. payment method — receipts note whether payment was cash, e-transfer, etc. **Decision: ignore payment method; it is not recorded in the output.**
   16. currency — no document explicitly states a currency. **Decision: assume all amounts are in the same currency (CAD); do not record a currency field.**
   17. "Monnaie" (change) line — receipts show the change given back to the customer. This is not a separate transaction and must not be recorded as one.
   18. e-transfer income — `artsupplies.jpeg` notes "E-TRANSFER RECEIVED", meaning this is income (money entering the customer's account). The amount must be recorded as positive.
   19. `invoices.xlsx` has "Date sent" and "Date paid", and some records have "Date sent" but not "Date paid".  **Decision: ignore invoices sent, only keep finalized transactions for simplicity**

Across all documents, we see that they typically represent transactions, with details about

* Actor (entity)
* Description
* Date/time
* Amount

Not all these fields are present every time, but these are roughly the fields that are shared for the customer.

Interestingly, `notes.txt` has information that suggest future plans and actions as well. Its existence suggest the fact that customers might dump some sort of files with overarching summary details about the files and other details.

Our target audience will be a typical Canadian freelancer, potentially a Quebecker, as it seems to be the case here.

## What we're building

Given all of these considerations above, the final decision is to build a tool that will aggregate the documents given by a particular customer seeking help with organizing their finances (they could be a freelancer or a generic customers). The framework we will build will produce outputs that contain records containing [actor, description, date/time, amount] for all the transactions.

We will support 4 types of documents:

| Format      | Extensions                    |
| ----------- | ----------------------------- |
| PDF         | `.pdf`                      |
| Spreadsheet | `.csv`, `.xlsx`           |
| Image       | `.jpg`, `.jpeg`, `.png` |
| Document    | `.txt`, `.docx`           |

## Approach & Planning

I saw 2 parts to this project
1. an interface or a way to upload the customer files
2. a way to process the files, outputting some result

I recently got AWS Kiro for students (https://kiro.dev/students/), which includes a lot of free coding credits, and I wanted to use some of them for this project.

Regarding point 1, I was originally thinking of building a CLI which would take as argument a folder containing all the financial data files a customer has. However, I thought that the overhead of building a basic frontend for file upload was actually very small using AWS Kiro (~1-2 hours), so I decided to go down that route. File upload is a very common functionality in websites, and some React components already incorporate it. This prediction turned out to be fairly accurate, and I built some basic frontend validation for the documents uploaded in a very simple manner within around 1-2 hours at most.

Regarding point 2, I wanted a server that supports multimodality. My aim was an architecture that supports different agent types for different types of documents, while keeping the usage free and maximizing the number of API requests possible. I thought this was fairly simple:
- for text documents, simply read and forward them to the agent
- for PDFs, can consider using a vision model for scanned documents or a normal text model to which you feed lines of text on a PDF
- for images, use a vision model
- ~~for CSVs, I need a model to read the general structure of the Excel/CSV file uploaded, and then generate some Python code for processing the pandas dataframe associated with it after determining its structure. This is typically the approach taken by AI-driven business intelligence tools where you dump CSV data and get charts in return.~~ **Update: The code generation approach did not work reliably. The model sometimes refused to generate code, or generated code that didn't properly parse the data. We switched to having the model directly inspect the CSV preview and call df_dump_rows with the extracted transactions.**

Coding the backend FastAPI server would be easy with AI. I chose FastAPI for its growing popularity among startups. Using Docker was fairly simple as well. I also assumed that the process of coding the individual agents was fairly simple. I already had a modular approach, which I could dictate to the LLMs, where different sub-agent classes inherit from a base agent class, each agent class taking as inputs its prompt, some tools it can invoke, etc. I had in mind the usage of `fastmcp`, which I was somewhat acquainted with and is a rather easy framework to use.

I wanted to dedicate a proportion of my free day time, whenever I was free, to working on the project.

## What went wrong

One key limitation of this project is the fact that we cannot use paid APIs or AI tooling. This imposes heavy restrictions on both the quality and the invocation rates of the models we can use.

My aim is to produce the highest quality in terms of outputs, while being able to support multimodality and being able to invoke the model as many times as possible on their free tier without hitting limits.

After browsing online, I found that Gemma 3 27B had decent rate limits for their free tier
```
Gemma 3 12B Instruct	15,000 tokens/minute
14,400 requests/day
30 requests/minute
Gemma 3 4B Instruct	15,000 tokens/minute
14,400 requests/day
30 requests/minute
Gemma 3 1B Instruct	15,000 tokens/minute
14,400 requests/day
30 requests/minute
```

However, after using the `google-genai` Python library, which was easily adaptable to `fastmcp`, I realized the silly mistake that Gemma could not be used, so I used `gemini-2.5-flash` instead, with a much stricter request limit.
After finding out that Gemma 3 27B and other Gemma 3 models have decent API limits, I had to use `gemini-2.5-flash` instead. For the sake of time, I stuck to `gemini-2.5-flash`, which is extremely rate-limited.

**The unfortunate consequence of this is that it seems like an API key is required, although it can be free**

## What went right
My time predictions for the frontend were on point. So were my time predictions for starting the basic backend, including the logic for starting a Docker container (I was not very familiar with `docker`).

## Reflections
I am surprised by the sheer amount of tooling available for using AI. LiteLLM, OpenRouter, Ollama, LangChain/LangGraph, the panoply of different models specific to each provider, what model is good, what model is bad... In particular, it was very hard for me to glance at the documentation and try to figure out what would work with what.

With my simple use case, I was thinking of 2 possible scenarios:
1. basic, local MCP server with specific tools I register
2. register tools directly in the function calls to the AI models

I found that whenever we define the tools themselves, we needed to pass a complex JSON object like 
```
{
  "type": "function",
  "function": {
    "name": "get_current_weather",
    "description": "Get the current weather in a given location",
    "parameters": {
      "type": "object",
      "properties": {
        "location": {
          "type": "string",
          "description": "The city and state, e.g. San Francisco, CA"
        },
        "unit": {
          "type": "string",
          "enum": ["celsius", "fahrenheit"]
        }
      },
      "required": ["location"]
    }
  }
}
```
which was possible, but ugly. Hence I ended up using `fastmcp` instead, where you simply annotate the tool functions with the `@mcp.tool` decorator.

It is only by looking at the `fastmcp` documentation that I narrowed down my possibilities, by answering the question of what models and tools actually worked with it.

Still, it seems like the agentic AI and LLM ecosystem is beyond imagination. I find it very hard to know what tooling worked with what, and what appropriate syntax to use. Do you use `results.data[0].text`? Or `results[0].data`? Does OpenRouter have support for the specific coding pattern I want? Does it work with `fastmcp`?

## Demos
See `recordings` folder. Note 2 different recordings were made - in the first recording, I forgot to scroll horizontally to illustrate the prices being displayed.

## Security

My approach to security is two-fold

1. think about the boundaries (i.e., input/output, passing data)
2. think about what happens in an execution environment

In this case, arguably the most important aspect is the potential malicious nature of the documents themselves. These documents can contain hidden instructions to LLMs, or be malicious in other ways.

To mitigate security risks, we perform some basic checking on the frontend to allowlist only the file extensions specified above for upload, and to perform some (very) rudimentary checking for file integrity.

In the backend, we intercept the files added in the frontend, spins up a Docker container from a minimal image, and perform all calls to AI models inside of the Docker container. This decision might not appeal to everyone, but I prefer this approach in order to limit the blast radius of "rogue" LLM and malicious instructions in the documents, and because we're reading only a very small set of files uploaded by the customer, I would rather not have the AI touch my file system at all.

~~The Dockerized approach is especially useful for LLMs to handle CSV data - given the unstructured nature of the data, I wanted an LLM to inspect it a bit before generating *and* executing the code. A sandbox for code execution is really helpful in this case - ideally, the code generated would also be inspected for safety, ensuring it is read-only.~~ **Update: The code generation/sandbox approach was abandoned because the model did not reliably generate working code. We now have the model directly inspect the CSV preview and extract transactions via tool calls, eliminating the need for code execution.**

This Dockerized approach would also be quite convenient in the cloud - I'd imagine a potential serverless offering of the service using something like ECS (Elastic Container Service), which spins up on-the-spot Docker instances on EC2 virtual machines.

## Structure

```
implementation/
├── frontend/   React + Vite upload UI
└── backend/    FastAPI upload endpoint + Dockerization + MCP + agentic workflow
```

## Frontend

Built with React (Vite) and Axios. No UI component library.

**Features:**

- Drag-and-drop or browse to select files
- Client-side integrity checks before upload:

  - Extension allowlist
  - MIME type vs. extension consistency
  - Magic byte validation (PDF, PNG, JPG, XLSX, DOCX)
  - CSV column-consistency heuristic
- Single-file upload or batch upload all ready files in one request

**Run:**

```bash
cd implementation/frontend
npm install
npm run dev
# → http://localhost:5173
```

## Backend

Built with FastAPI. Requires Docker to be running before the server starts — a startup check enforces this.

**Endpoint:** `POST /upload`
Accepts `multipart/form-data` with one or more files under the `files` field.

**Flow:**

1. Validates all file extensions
2. Writes files to a temporary host directory
3. Spins up `doc-processor:latest` with that directory bind-mounted read-only at `/app/data`
4. Returns `container_id` and `status: container_started`

**Run:**

```bash
cd implementation/backend

# Create and activate virtualenv
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Set KEY. Note that you can opt for the free tier on Google AI Studio at https://aistudio.google.com/api-keys,
# which will limit you to just the free tier's calling, thereby obeying the constraints.
export GOOGLE_API_KEY=[your Google API key]

# Install dependencies
pip install -r requirements.txt

# Build the processing image
docker build -t doc-processor:latest .

# Start the API
uvicorn main:app --reload
# → http://localhost:8000
```

**Requirements:** Python 3.10+, Docker Desktop (daemon must be running)

## Images


## Future roadmap
- focus on PII redaction and security guardrails for LLMs
- custom agents for validating file contents of different files
- cloud-native offering, potentially serverless
  - encryption at rest (blob storage, like S3) for saving customer's uploaded artifacts. Sensitive data handling really important here...
  - encryption in transit (HTTPS/TLS) for uploading
- proper logging
- further testing with more customer data - repeatable unit tests to ensure that results produced are consistent
- further testing with more models - potentially exploring different models and how they fare
- further testing different ways of ingesting the data. I'm thinking especially PaddleOCR for working with PDFs.


## Limitations of the current approach
- Big files might not be properly processed by the LLM, could bloat the context window beyond capacity. **Solution: typically this would be a rarer use case, but could consider breaking down a document into multiple pieces and feeding them**
- Need a way of verifying the integrity of the files processed beyond basic sanity checks. **Solution: have an extra LLM specifically for overviewing the data in the files and ensuring that the data in there is secure.**
- The current way of parsing PDFs is using a PDF parsing library in Python which reads the characters. However, if the PDFs are actually raw scans instead of something like the Visa statement with recognizable characters, it might not work **Solution: based on the result of trying to parse the characters of the PDF, make a decision as to whether to submit the PDF as an image or a stream of proper valid characters read from it.**
- Potential duplicated data not handled. The refunds mentioned in `note.txt` which appears in the Visa statement as well might appear as duplicates. **Solution: consider**
- Overall context is not properly understood. A file like `note.txt` can give some kind of context into the other files (in our case, Visa statements for example). **Solution: prior to each individual LLM parsing its own data, have an orchestrator agent of some sort read through all the files, gathering and synthesizing context, and then giving that context to the LLMs. This could be potentially very dangerous, as 1) the documents themselves might contain malicious and hidden instructions, and 2) the orchestrator agent could give malicious instructions or malicious context. Both should be taken into account - perhaps have an aside LLM read the documents and the instructions given by the orchestrator.**
- Model availability: occasionally hitting upon 503 UNAVAILABLE. **Solution: some sort of model fallback mechanism, or retry mechanism.**
- Inconsistency in model outputs. **Solution: better prompting, better MCP tools, potentially better models.**
- Prompt for AI reading CSV might be too specific to our use case. To be made more generic.