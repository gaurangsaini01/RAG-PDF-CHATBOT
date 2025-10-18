from fastapi import FastAPI, UploadFile, File, Form,HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from dotenv import load_dotenv
from openai import OpenAI
import os
import io
import json
from typing import Optional
from langchain_qdrant import QdrantVectorStore
from langchain_openai import OpenAIEmbeddings
from langchain.schema import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pypdf import PdfReader

load_dotenv()

# -------------------------
# GLOBAL VARIABLES
# -------------------------
agent_client: Optional[OpenAI] = None
GLOBAL_API_KEY: Optional[str] = None
GLOBAL_TEMPERATURE: float = 0.7

# -------------------------
# FASTAPI CONFIG
# -------------------------
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -------------------------
# MODELS
# -------------------------
class ConfigurationReq(BaseModel):
    openai_key: str
    temperature: float

class QueryRequest(BaseModel):
    query: str
    collection_name: str

# -------------------------
# HELPER FUNCTIONS
# -------------------------

SYSTEM_PROMPT = """
You are an AI agent who answers user queries based only on the context below, including page numbers.
You can use your own knowledge also around the context provided , but make sure use references from context also if present . 
Always answer based strictly on the context.
Eg : What is Node js ? 
Context : Node js is a runtime environment.
Your answer : Node js is an asynchronous runtime js environment made on V8 . For more reference visit the respective page .
After every answer found in the context, mention the page number like: "for more reference visit page number".
If no answer from context is found simply deny as its not in your context / scope.

Upon being asked who are you , Just reply I am an AI agent designed to help you answer your queries based on the context provided.
"""

def validate_openai_key(api_key: str) -> Optional[OpenAI]:
    """Check if OpenAI key is valid by making a test call."""
    try:
        client = OpenAI(api_key=api_key)
        # Minimal test request
        client.models.list()
        return client
    except Exception:
        return None


def create_agent(openai_key: str, temperature: float) -> OpenAI:
    """Create an OpenAI client (agent)."""
    global agent_client, GLOBAL_API_KEY, GLOBAL_TEMPERATURE
    client = validate_openai_key(openai_key)
    if not client:
        raise HTTPException(status_code=401,detail="Invalid Open-Ai Key")
    agent_client = client
    GLOBAL_API_KEY = openai_key
    GLOBAL_TEMPERATURE = temperature
    return {"success":"true","message":"Session Started Successfully"}


def ingestPdf(file: bytes, collection_name: str):
    """Ingest PDF into Qdrant after splitting into chunks."""
    file_buffer = io.BytesIO(file)
    reader = PdfReader(file_buffer)
    pages = reader.pages

    docs = []
    for i, page in enumerate(pages):
        raw_text = page.extract_text() or ""
        if raw_text.strip():
            docs.append(
                Document(
                    page_content=raw_text,
                    metadata={"page_number": i + 1}
                )
            )

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=1200,
        chunk_overlap=300
    )

    split_docs = splitter.split_documents(documents=docs)
    embeddings = OpenAIEmbeddings(model="text-embedding-3-large")

    QdrantVectorStore.from_documents(
        documents=split_docs,
        embedding=embeddings,
        url=os.getenv("QDRANT_URL"),
        prefer_grpc=True,
        api_key=os.getenv("QDRANT_API_KEY"),
        collection_name=collection_name,
    )
    return {"message": "Ingestion Done Successfully"}


def getAnswerBySemanticSearch(query: str, collection_name: str):
    """Search in Qdrant and answer using OpenAI agent."""
    if not agent_client or not GLOBAL_API_KEY:
        return {"error": "Agent not configured. Please call /configure first."}

    try:
        embeddings = OpenAIEmbeddings(model="text-embedding-3-large")
        vector_db = QdrantVectorStore.from_existing_collection(
            collection_name=collection_name,
            embedding=embeddings,
            url=os.getenv("QDRANT_URL"),
            api_key=os.getenv("QDRANT_API_KEY"),
        )

        results = vector_db.similarity_search(query=query)

        context = []
        for result in results:
            context.append({
                "page_content": result.page_content,
                "page_number": result.metadata.get("page_number")
            })

        stringified_context = json.dumps(context)

        prompt = f"{SYSTEM_PROMPT}\n\nContext:\n{stringified_context}"

        response = agent_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": query}
            ],
            temperature=GLOBAL_TEMPERATURE
        )

        return response.choices[0].message.content

    except Exception as e:
        return {"error": str(e)}

# -------------------------
# ROUTES
# -------------------------

@app.post("/upload-pdf")
async def uploadpdf(file: UploadFile = File(...), collection_name: str = Form(...)):
    try:
        content = await file.read()
        file_name = f"document_{collection_name}"
        ingestPdf(content, file_name)
        return {"message": "Ingestion Done"}
    except Exception as e:
        return {"error": str(e)}


@app.post("/get-answer-from-pdf")
async def answerQuery(request: QueryRequest):
    file_name = f"document_{request.collection_name}"
    answer = getAnswerBySemanticSearch(request.query, file_name)
    print(answer)
    if isinstance(answer, str):
        return {"answer": answer}
    else : raise HTTPException(status_code=400,detail={"message":"Something went wrong"})


@app.post("/configure")
async def configuration(request: ConfigurationReq):
        res = create_agent(request.openai_key, request.temperature)
        return res
