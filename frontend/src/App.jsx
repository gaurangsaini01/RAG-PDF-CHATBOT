import React, { useState, useRef, useEffect } from "react";
import {
  Upload,
  Send,
  Settings,
  Key,
  Thermometer,
  Play,
  FileText,
  Bot,
  User,
  Loader2,
  CheckCircle,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function App() {
  const controller = useRef(null);
  const inputRef = useRef(null)
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [startingSession, setStartingSession] = useState(false);
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState([]);
  const [isQuerying, setIsQuerying] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Configuration states
  const [openaiKey, setOpenaiKey] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
    if(inputRef.current){
      inputRef.current.focus()
    }
  }, [messages]);

  const endSession = async () => {
    if (controller.current) {
      controller.current.abort();
    }
    setMessages([]);
    setSessionStarted(false);
    setStartingSession(false);
    setIsUploading(false);
    setIsQuerying(false);
    setOpenaiKey("");
    setFile(null);
    setUploadComplete(false);
    setQuery("");
  };
  const startSession = async () => {
    try {
      setStartingSession(true);
      const response = await fetch(
        `${import.meta.env.VITE_APP_BACKEND_URL}/configure`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            openai_key: openaiKey,
            temperature: temperature,
          }),
        }
      );
      const res = await response?.json();
      if (res?.success) {
        setSessionStarted(true);
      } else {
        throw new Error("Failed to configure session");
      }
    } catch (error) {
      setError("Invalid api key");
    } finally {
      setStartingSession(false);
    }
  };

  const submitHandler = async () => {
    if (!file || !sessionStarted) return;
    controller.current = new AbortController();
    const { signal } = controller.current;
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("collection_name", file.name);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_APP_BACKEND_URL}/upload-pdf`,
        {
          method: "POST",
          body: formData,
          signal,
        }
      );

      if (response.ok) {
        setUploadComplete(true);
      } else {
        throw new Error("Failed to upload file");
      }
      setIsUploading(false);
    } catch (error) {
      setIsUploading(false);
    }
  };

  const changeHandler = (e) => {
    const f = e.target.files[0];
    setFile(f);
    setUploadComplete(false);
  };

  const handleQuery = async () => {
    if (!query.trim() || !uploadComplete || !sessionStarted) return;

    const userMessage = { type: "user", content: query };
    setMessages((prev) => [...prev, userMessage]);
    setIsQuerying(true);
    const currentQuery = query;
    setQuery("");

    try {
      const response = await fetch(
        `${import.meta.env.VITE_APP_BACKEND_URL}/get-answer-from-pdf`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: currentQuery,
            collection_name: file.name,
          }),
        }
      );

      const data = await response.json();
      if (data?.detail) {
        throw new Error("");
      }
      const botMessage = { type: "bot", content: data.answer };
      setMessages((prev) => [...prev, botMessage]);
      setIsQuerying(false);
    } catch (error) {
      const errorMessage = {
        type: "bot",
        content:
        "Sorry, your session has expired please reload the page and start again.",
      };
      setMessages((prev) => [...prev, errorMessage]);
      setIsQuerying(false);
    } finally {
      if(inputRef.current)
        inputRef.current.focus()
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleQuery();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex">
      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? "w-80" : "w-0"
        } transition-all duration-300 overflow-hidden bg-black/20 backdrop-blur-xl border-r border-white/10`}
      >
        <div className="p-6 h-full flex flex-col">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold text-white">PDF Assistant</h1>
          </div>

          <div className="space-y-6 flex-1">
            {/* OpenAI Key Input */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                <Key className="w-4 h-4" />
                OpenAI API Key
              </label>
              <input
                type="password"
                value={openaiKey}
                onChange={(e) => {
                  setOpenaiKey(e.target.value);
                  setError("");
                }}
                placeholder="sk-..."
                className="w-full px-4 py-3 bg-white/10 backdrop-blur border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                disabled={sessionStarted}
              />
              {error && (
                <span className="text-sm text-red-400">
                  Enter a valid api key
                </span>
              )}
            </div>

            {/* Temperature Slider */}
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-300">
                <Thermometer className="w-4 h-4" />
                Temperature: {temperature}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
                disabled={sessionStarted}
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>Focused</span>
                <span>Creative</span>
              </div>
            </div>

            {/* Start Session Button */}
            <button
              onClick={startSession}
              disabled={sessionStarted || !openaiKey.trim()}
              className={`w-full px-4 py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
                sessionStarted
                  ? "bg-green-600 text-white cursor-not-allowed"
                  : "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white hover:scale-105 active:scale-95"
              }`}
            >
              {sessionStarted ? (
                <>
                  <CheckCircle className="w-5 h-5" />
                  Session Active
                </>
              ) : startingSession ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Starting ....
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" />
                  Start Session
                </>
              )}
            </button>
            {sessionStarted && (
              <button
                onClick={endSession}
                className="text-white cursor-pointer hover:bg-red-600 hover:transition-all ease-in hover:shadow-xl px-4 py-2 rounded-xl bg-red-700"
              >
                End Session
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-white/10 bg-black/20 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <Settings className="w-5 h-5 text-white" />
            </button>
            <div className="text-center">
              <h2 className="text-xl font-semibold text-white">
                Document Intelligence
              </h2>
              <p className="text-gray-400 text-sm">
                Upload PDF and ask questions
              </p>
            </div>
            <div className="w-9" />
          </div>
        </div>

        {/* Upload Section */}
        {!uploadComplete && (
          <div className="p-6 border-b border-white/10">
            <div className="max-w-2xl mx-auto">
              <div className="space-y-4">
                <div
                  className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer hover:border-blue-400 hover:bg-blue-400/5 ${
                    file ? "border-blue-400 bg-blue-400/10" : "border-white/20"
                  }`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    onChange={changeHandler}
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    disabled={!sessionStarted}
                  />

                  <div className="space-y-4">
                    <div className="mx-auto w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                      <Upload className="w-8 h-8 text-white" />
                    </div>

                    {file ? (
                      <div>
                        <p className="text-white font-medium">{file.name}</p>
                        <p className="text-gray-400 text-sm">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-white font-medium">
                          Click to upload PDF
                        </p>
                        <p className="text-gray-400 text-sm">
                          or drag and drop your file here
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {file && (
                  <button
                    onClick={submitHandler}
                    disabled={isUploading || !sessionStarted}
                    className="w-full px-6 py-3 bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Ingesting Document...
                      </>
                    ) : (
                      <>
                        <FileText className="w-5 h-5" />
                        Process Document
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Chat Section */}
        <div className="flex-1 flex flex-col">
          {uploadComplete && (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-scroll max-h-[73vh] p-6">
                <div className="max-w-4xl mx-auto space-y-4">
                  {messages.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Bot className="w-8 h-8 text-white" />
                      </div>
                      <h3 className="text-xl font-semibold text-white mb-2">
                        Ready to answer your questions!
                      </h3>
                      <p className="text-gray-400">
                        Ask anything about the uploaded document
                      </p>
                    </div>
                  ) : (
                    messages.map((message, index) => (
                      <div
                        key={index}
                        className={`flex gap-3 ${
                          message.type === "user"
                            ? "justify-end"
                            : "justify-start"
                        }`}
                      >
                        <div
                          className={`flex gap-3 max-w-3xl ${
                            message.type === "user"
                              ? "flex-row-reverse"
                              : "flex-row"
                          }`}
                        >
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                              message.type === "user"
                                ? "bg-gradient-to-r from-blue-500 to-purple-600"
                                : "bg-gradient-to-r from-purple-500 to-pink-500"
                            }`}
                          >
                            {message.type === "user" ? (
                              <User className="w-4 h-4 text-white" />
                            ) : (
                              <Bot className="w-4 h-4 text-white" />
                            )}
                          </div>
                          <div
                            className={`px-4 py-3 rounded-lg backdrop-blur border ${
                              message.type === "user"
                                ? "bg-blue-600/20 border-blue-500/30 text-white"
                                : "bg-white/10 border-white/20 text-white"
                            }`}
                          >
                            {message.type === "user" ? (
                              <p className="whitespace-pre-wrap">
                                {message.content}
                              </p>
                            ) : (
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {String(message.content)}
                              </ReactMarkdown>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}

                  {isQuerying && (
                    <div className="flex gap-3">
                      <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                        <Bot className="w-4 h-4 text-white" />
                      </div>
                      <div className="px-4 py-3 bg-white/10 backdrop-blur border border-white/20 rounded-lg">
                        <div className="flex items-center gap-2 text-gray-300">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Thinking...
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              </div>

              {/* Query Input */}
              <div className="p-6 border-t border-white/10 bg-black/20 backdrop-blur-xl">
                <div className="max-w-4xl mx-auto">
                  <div className="flex gap-3">
                    <input
                    ref={inputRef}
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={handleKeyPress}
                      placeholder="Ask a question about your document..."
                      className="flex-1 px-4 py-3 bg-white/10 backdrop-blur border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                      disabled={isQuerying}
                    />
                    <button
                      onClick={handleQuery}
                      disabled={!query.trim() || isQuerying}
                      className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Success State */}
          {uploadComplete && messages.length === 0 && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-20 h-20 bg-gradient-to-r from-green-500 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                  <CheckCircle className="w-10 h-10 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">
                  Document Ready!
                </h3>
                <p className="text-gray-400 mb-6">
                  Your PDF has been processed and is ready for questions
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>
        {`
         .slider::-webkit-slider-thumb {
                appearance: none;
                height: 20px;
                width: 20px;
                border-radius: 50%;
                background: linear-gradient(45deg, #3b82f6, #8b5cf6);
                cursor: pointer;
                box-shadow: 0 0 10px rgba(59, 130, 246, 0.5);
              }

              .slider::-moz-range-thumb {
                height: 20px;
                width: 20px;
                border-radius: 50%;
                background: linear-gradient(45deg, #3b82f6, #8b5cf6);
                cursor: pointer;
                border: none;
                box-shadow: 0 0 10px rgba(59, 130, 246, 0.5);
      }
    `}
      </style>
    </div>
  );
}

export default App;
