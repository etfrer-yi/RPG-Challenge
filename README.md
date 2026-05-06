# RPG Challenge

A financial document upload pipeline. Users upload documents via a React frontend; the FastAPI backend analyzes them and spins up a Docker container with the files available at `/app/data` for processing. The processing produces a CSV file with the aggregated data from everything.

## Understanding the project

Upon reading the project details and the data, some observations could be made.

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

Across all documents, we see that they typically represent transactions, with details about

* Actor (entity)
* Description
* Date/time
* Amount

Not all these fields are present every time, but these are roughly the fields that are shared for the customer.

Interestingly, `notes.txt` has information that suggest future plans and actions as well. Its existence suggest the fact that customers might dump some sort of files with overarching summary details about the files and other details.

Our target audience will be a typical Canadian freelancer, potentially a Quebecker.

## What we're building

Given all of these considerations above, the final decision is to build a tool that will aggregate the documents given by a particular customer seeking help with organizing their finances (they could be a freelancer or a generic customers). The framework we will build will produce outputs that contain records containing [actor, description, date/time, amount] for all the transactions.

We will support 4 types of documents:

| Format      | Extensions                    |
| ----------- | ----------------------------- |
| PDF         | `.pdf`                      |
| Spreadsheet | `.csv`, `.xlsx`           |
| Image       | `.jpg`, `.jpeg`, `.png` |
| Document    | `.txt`, `.docx`           |

## Approach

We have seen that the data is multimodal and also unclean, spread across different possible file types. This hints at the need to use LLM to parse the documents and be able to generate outputs.

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

However, after using the `google-genai` Python library, which was easily adaptable to `fastmcp`, I realized the silly mistake that Gemma could not be used, so I used `gemini-2.5-flash` instead, with a much stronger request limit.

## Security

My approach to security is two-fold

1. think about the boundaries (i.e., input/output, passing data)
2. think about what happens in an execution environment

In this case, arguably the most important aspect is the potential malicious nature of the documents themselves. These documents can contain hidden instructions to LLMs, or be malicious in other ways.

To mitigate security risks, we perform some basic checking on the frontend to allowlist only the file extensions specified above for upload, and to perform some (very) rudimentary checking for file integrity.

In the backend, we intercept the files added in the frontend, spins up a Docker container from a minimal image, and perform all calls to AI models inside of the Docker container. This decision might not appeal to everyone, but I prefer this approach in order to limit the blast radius of "rogue" LLM and malicious instructions in the documents, and because we're reading only a very small set of files uploaded by the customer, I would rather not have the AI touch my file system at all.

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
export GEMINI_API_KEY=[your Google API key]

# Install dependencies
pip install -r requirements.txt

# Build the processing image
docker build -t doc-processor:latest .

# Start the API
uvicorn main:app --reload
# → http://localhost:8000
```

**Requirements:** Python 3.10+, Docker Desktop (daemon must be running)

## Sample output
This is a sample printed output from the backend when I uploaded `Visa_Statement_Q12025.pdf`
```
[05/06/26 22:42:15] INFO     Processing request of type            server.py:727
                             ListToolsRequest                                   
[05/06/26 22:42:16] INFO     Processing request of type            server.py:727
                             CallToolRequest                                    
[05/06/26 22:42:32] INFO     Processing request of type            server.py:727
                             CallToolRequest                                    
                    INFO     Warning: FutureWarning: The behavior  server.py:717
                             of DataFrame concatenation with empty              
                             or all-NA entries is deprecated. In a              
                             future version, this will no longer                
                             exclude empty or all-NA columns when               
                             determining the result dtypes. To                  
                             retain the old behavior, exclude the               
                             relevant entries before the concat                 
                             operation.                                         
                    INFO     Processing request of type            server.py:727
                             CallToolRequest                                    
                    INFO     Processing request of type            server.py:727
                             CallToolRequest                                    
                    INFO     Processing request of type            server.py:727
                             CallToolRequest                                    
                    INFO     Processing request of type            server.py:727
                             CallToolRequest                                    
                    INFO     Processing request of type            server.py:727
                             CallToolRequest                                    
                    INFO     Processing request of type            server.py:727
                             CallToolRequest                                    
                    INFO     Processing request of type            server.py:727
                             CallToolRequest                                    
                    INFO     Processing request of type            server.py:727
                             CallToolRequest                                    
                    INFO     Processing request of type            server.py:727
                             CallToolRequest                                    
                    INFO     Processing request of type            server.py:727
                             CallToolRequest                                    
                    INFO     Processing request of type            server.py:727
                             CallToolRequest                                    
                    INFO     Processing request of type            server.py:727
                             CallToolRequest                                    
                    INFO     Processing request of type            server.py:727
                             CallToolRequest                                    
                    INFO     Processing request of type            server.py:727
                             CallToolRequest                                    
                    INFO     Processing request of type            server.py:727
                             CallToolRequest                                    
                    INFO     Processing request of type            server.py:727
                             CallToolRequest                                    
                    INFO     Processing request of type            server.py:727
                             CallToolRequest                                    
                    INFO     Processing request of type            server.py:727
                             CallToolRequest                                    
                    INFO     Processing request of type            server.py:727
                             CallToolRequest                                    
                    INFO     Processing request of type            server.py:727
                             CallToolRequest                                    
                    INFO     Processing request of type            server.py:727
                             CallToolRequest                                    
                    INFO     Processing request of type            server.py:727
                             CallToolRequest                                    
                    INFO     Processing request of type            server.py:727
                             CallToolRequest                                    
                    INFO     Processing request of type            server.py:727
                             CallToolRequest                                    
                    INFO     Processing request of type            server.py:727
                             CallToolRequest                                    
                    INFO     Processing request of type            server.py:727
                             CallToolRequest                                    
                    INFO     Processing request of type            server.py:727
                             CallToolRequest                                    
                    INFO     Processing request of type            server.py:727
                             CallToolRequest                                    
                    INFO     Processing request of type            server.py:727
                             CallToolRequest                                    
                    INFO     Processing request of type            server.py:727
                             CallToolRequest                                    
                    INFO     Processing request of type            server.py:727
                             CallToolRequest                                    
                    INFO     Processing request of type            server.py:727
                             CallToolRequest                                    
                    INFO     Processing request of type            server.py:727
                             CallToolRequest                                    
                    INFO     Processing request of type            server.py:727
                             CallToolRequest                                    
                    INFO     Processing request of type            server.py:727
                             CallToolRequest                                    
[05/06/26 22:42:45] INFO     Processing request of type            server.py:727
                             CallToolRequest                                    
/app/processor/main_processor.py:128: FutureWarning: Passing literal json to 'read_json' is deprecated and will be removed in a future version. To read from a literal string, wrap it in a 'StringIO' object.
  df = pd.read_json(raw)

=== TRANSACTIONS ===
                             origin       date                description             actor  amount
/app/data/Visa_Statement_Q12025.pdf 2025-01-03          GOOGLE *WORKSPACE            GOOGLE   -8.28
/app/data/Visa_Statement_Q12025.pdf 2025-01-06         ADOBE *CREATIVE CL             ADOBE  -74.99
/app/data/Visa_Statement_Q12025.pdf 2025-01-06         ADOBE *CREATIVE CL             ADOBE  -74.99
/app/data/Visa_Statement_Q12025.pdf 2025-01-06                  CANVA.COM         CANVA.COM  -16.99
/app/data/Visa_Statement_Q12025.pdf 2025-01-10                NETFLIX.COM       NETFLIX.COM  -16.99
/app/data/Visa_Statement_Q12025.pdf 2025-01-15                   SHOPIFY*          SHOPIFY*  -39.00
/app/data/Visa_Statement_Q12025.pdf 2025-01-15         VRBO COWORKING MTL              VRBO  -30.00
/app/data/Visa_Statement_Q12025.pdf 2025-01-18 WAYMO BUSINESS *X MONTREAL    WAYMO BUSINESS  -18.50
/app/data/Visa_Statement_Q12025.pdf 2025-01-23                PETCO #4521             PETCO  -47.83
/app/data/Visa_Statement_Q12025.pdf 2025-01-25              POSTES CANADA     POSTES CANADA  -14.50
/app/data/Visa_Statement_Q12025.pdf 2025-01-28              STAPLES #0312           STAPLES  -45.99
/app/data/Visa_Statement_Q12025.pdf 2025-01-31          AMAZON.CA *OFFICE         AMAZON.CA  -33.47
/app/data/Visa_Statement_Q12025.pdf 2025-02-03          GOOGLE *WORKSPACE            GOOGLE   -8.28
/app/data/Visa_Statement_Q12025.pdf 2025-02-06         ADOBE *CREATIVE CL             ADOBE  -74.99
/app/data/Visa_Statement_Q12025.pdf 2025-02-06                  CANVA.COM         CANVA.COM  -16.99
/app/data/Visa_Statement_Q12025.pdf 2025-02-10                NETFLIX.COM       NETFLIX.COM  -16.99
/app/data/Visa_Statement_Q12025.pdf 2025-02-10         VRBO COWORKING MTL              VRBO  -25.00
/app/data/Visa_Statement_Q12025.pdf 2025-02-14         ADOBE *CREATIVE CL             ADOBE   40.00
/app/data/Visa_Statement_Q12025.pdf 2025-02-15                   SHOPIFY*          SHOPIFY*  -39.00
/app/data/Visa_Statement_Q12025.pdf 2025-02-15                   SHOPIFY*          SHOPIFY*  -39.00
/app/data/Visa_Statement_Q12025.pdf 2025-02-18          LE PETIT DEP REST LE PETIT DEP REST  -64.73
/app/data/Visa_Statement_Q12025.pdf 2025-02-22          AMAZON.CA *OFFICE         AMAZON.CA  -22.15
/app/data/Visa_Statement_Q12025.pdf 2025-02-24           SQ *CAFE MYRIADE  SQ *CAFE MYRIADE  -62.88
/app/data/Visa_Statement_Q12025.pdf 2025-02-27              POSTES CANADA     POSTES CANADA  -18.75
/app/data/Visa_Statement_Q12025.pdf 2025-03-03          GOOGLE *WORKSPACE            GOOGLE   -8.28
/app/data/Visa_Statement_Q12025.pdf 2025-03-06         ADOBE *CREATIVE CL             ADOBE  -54.99
/app/data/Visa_Statement_Q12025.pdf 2025-03-06                  CANVA.COM         CANVA.COM  -16.99
/app/data/Visa_Statement_Q12025.pdf 2025-03-10                NETFLIX.COM       NETFLIX.COM  -16.99
/app/data/Visa_Statement_Q12025.pdf 2025-03-10         VRBO COWORKING MTL              VRBO  -35.00
/app/data/Visa_Statement_Q12025.pdf 2025-03-10         VRBO COWORKING MTL              VRBO  -35.00
/app/data/Visa_Statement_Q12025.pdf 2025-03-12              STAPLES #0312           STAPLES  -32.49
/app/data/Visa_Statement_Q12025.pdf 2025-03-14              STAPLES #0312           STAPLES   32.49
/app/data/Visa_Statement_Q12025.pdf 2025-03-15                   SHOPIFY*          SHOPIFY*  -39.00
/app/data/Visa_Statement_Q12025.pdf 2025-03-18              NAMECHEAP.COM     NAMECHEAP.COM  -22.99
/app/data/Visa_Statement_Q12025.pdf 2025-03-22          AMAZON.CA *OFFICE         AMAZON.CA  -28.90
/app/data/Visa_Statement_Q12025.pdf 2025-03-28              POSTES CANADA     POSTES CANADA  -12.25
```

## What went wrong

* I knew about document upload, but ideally the customer should be able to upload entire folders instead of selecting each document.
* After finding out that Gemma 3 27B and other Gemma 3 models have decent API limits, I had to use `gemini-2.5-flash` instead.

## Future roadmap

- focus on PII redaction and security guardrails for LLMs
- custom agents for validating file contents of different files
- cloud-native offering, potentially serverless
  - encryption at rest (blob storage, like S3) for saving customer's uploaded artifacts
  - encryption in transit (HTTPS/TLS) for uploading
- proper logging
- further testing with more customer data - repeatable unit tests to ensure that results produced are consistent
- further testing with more models - potentially exploring different models and how they fare


## Limitations of the current approach
- Big files might not be properly processed by the LLM, could bloat the context window beyond capacity
- Need a way of verifying the integrity of the files processed beyond basic sanity checks
- 