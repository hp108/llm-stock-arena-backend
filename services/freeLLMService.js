const axios = require('axios');

// Free LLM APIs: Groq, NVIDIA, OpenRouter
class FreeLLMService {
  constructor() {
    this.providers = {
      'ChatGPT': this.callGroq.bind(this),
      'Claude': this.callOpenRouter.bind(this),
      'Grok': this.callNVIDIA.bind(this),
      'DeepSeek': this.callGroqDeepSeek.bind(this)
    };
  }

  getApiKeys() {
    return {
      groq: process.env.GROQ_API_KEY || '',
      openrouter: process.env.OPENROUTER_API_KEY || '',
      nvidia: process.env.NVIDIA_API_KEY || ''
    };
  }

  async getTradingDecision(agent, stockData, portfolio) {
    try {
      const provider = this.providers[agent.name];
      if (!provider) throw new Error(`Unknown agent: ${agent.name}`);
      
      const keys = this.getApiKeys();
      
      // Use fallback if no API key
      if (!keys.groq && !keys.openrouter && !keys.nvidia) {
        console.log(`⚠️ No API keys configured for ${agent.name}, using local strategy`);
        return this.getLocalStrategy(agent.name, stockData, portfolio);
      }

      const prompt = this.buildTradingPrompt(agent, stockData, portfolio);
      const decision = await provider(prompt);
      return this.parseDecision(decision);
    } catch (error) {
      console.error(`LLM Error for ${agent.name}:`, error.message.slice(0, 80));
      return this.getLocalStrategy(agent.name, stockData, portfolio);
    }
  }

  // Local strategy fallback (works without API keys)
  getLocalStrategy(agentName, stocks, portfolio) {
    const strategies = {
      'ChatGPT': () => {
        const positive = stocks.filter(s => s.dayChangePercent > 0).sort((a, b) => b.dayChangePercent - a.dayChangePercent);
        if (positive.length > 0) {
          const stock = positive[0];
          const qty = Math.floor((2000 * 0.2) / stock.currentPrice);
          return { action: 'BUY', symbol: stock.symbol, quantity: qty, reasoning: `ChatGPT: ${stock.symbol} showing positive momentum (+${stock.dayChangePercent.toFixed(1)}%)`, confidence: 0.7 };
        }
        return { action: 'HOLD', symbol: '', quantity: 0, reasoning: 'ChatGPT: No clear momentum signals', confidence: 0.5 };
      },
      'Claude': () => {
        const tech = stocks.filter(s => s.sector === 'Technology').sort((a, b) => a.currentPrice - b.currentPrice);
        if (tech.length > 0) {
          const stock = tech[0];
          const qty = Math.floor((2000 * 0.2) / stock.currentPrice);
          return { action: 'BUY', symbol: stock.symbol, quantity: qty, reasoning: `Claude: ${stock.symbol} is undervalued tech stock`, confidence: 0.7 };
        }
        return { action: 'HOLD', symbol: '', quantity: 0, reasoning: 'Claude: Analyzing value opportunities', confidence: 0.5 };
      },
      'Grok': () => {
        const volatile = [...stocks].sort((a, b) => Math.abs(b.dayChangePercent) - Math.abs(a.dayChangePercent));
        if (volatile.length > 0) {
          const stock = volatile[0];
          const qty = Math.floor((2000 * 0.25) / stock.currentPrice);
          return { action: 'BUY', symbol: stock.symbol, quantity: qty, reasoning: `Grok: High volatility play on ${stock.symbol}`, confidence: 0.65 };
        }
        return { action: 'HOLD', symbol: '', quantity: 0, reasoning: 'Grok: Scanning volatility', confidence: 0.5 };
      },
      'DeepSeek': () => {
        const aiStocks = stocks.filter(s => ['NVDA', 'MSFT', 'GOOGL'].includes(s.symbol)).sort((a, b) => b.dayChangePercent - a.dayChangePercent);
        if (aiStocks.length > 0) {
          const stock = aiStocks[0];
          const qty = Math.floor((2000 * 0.2) / stock.currentPrice);
          return { action: 'BUY', symbol: stock.symbol, quantity: qty, reasoning: `DeepSeek: AI sector play on ${stock.symbol}`, confidence: 0.75 };
        }
        return { action: 'HOLD', symbol: '', quantity: 0, reasoning: 'DeepSeek: Awaiting AI sector entry', confidence: 0.5 };
      }
    };
    return (strategies[agentName] || (() => ({ action: 'HOLD', symbol: '', quantity: 0, reasoning: 'No strategy', confidence: 0.5 })))();
  }

  buildTradingPrompt(agent, stocks, portfolio) {
    const pf = Object.entries(portfolio).length > 0 ? JSON.stringify(portfolio) : 'None';
    const info = stocks.map(s => `${s.symbol}:₹${s.currentPrice.toFixed(2)}(${s.dayChangePercent>=0?'+':''}${s.dayChangePercent.toFixed(1)}%)`).join(', ');
    return `You are ${agent.name} trading bot with ₹${agent.currentCapital}. Portfolio: ${pf}. Stocks: ${info}. Decide: BUY/SELL/HOLD. Return JSON {"action":"BUY|SELL|HOLD","symbol":"X","quantity":N,"reasoning":"why"}`;
  }

  async callGroq(prompt) {
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new Error('No Groq key');
    const resp = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'llama-3.1-70b-versatile', messages: [{role:'user',content:prompt}], max_tokens: 150, temperature: 0.3
    }, { headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }, timeout: 10000 });
    return resp.data.choices[0].message.content;
  }

  async callGroqDeepSeek(prompt) {
    const key = process.env.GROQ_API_KEY;
    if (!key) throw new Error('No Groq key');
    const resp = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'deepseek-r1-distill-llama-70b', messages: [{role:'user',content:prompt}], max_tokens: 150, temperature: 0.3
    }, { headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }, timeout: 15000 });
    return resp.data.choices[0].message.content;
  }

  async callOpenRouter(prompt) {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) throw new Error('No OpenRouter key');
    const resp = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: 'anthropic/claude-3-haiku:free', messages: [{role:'user',content:prompt}], max_tokens: 150
    }, { headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', 'HTTP-Referer':'http://localhost','X-Title':'Trading' }, timeout: 15000 });
    return resp.data.choices[0].message.content;
  }

  async callNVIDIA(prompt) {
    const key = process.env.NVIDIA_API_KEY;
    if (!key) throw new Error('No NVIDIA key');
    const resp = await axios.post('https://integrate.api.nvidia.com/v1/chat/completions', {
      model: 'nvidia/llama-3.1-nemotron-70b-instruct', messages: [{role:'user',content:prompt}], max_tokens: 150, temperature: 0.3
    }, { headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }, timeout: 15000 });
    return resp.data.choices[0].message.content;
  }

  parseDecision(text) {
    try {
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) throw new Error('No JSON');
      const d = JSON.parse(m[0]);
      return { action: ['BUY','SELL','HOLD'].includes(d.action) ? d.action : 'HOLD', symbol: (d.symbol||'').toUpperCase(), quantity: Math.max(0,Math.floor(d.quantity)||0), reasoning: (d.reasoning||'No reason').slice(0,200), confidence: Math.min(1,Math.max(0.1,d.confidence||0.5)) };
    } catch { return { action: 'HOLD', symbol: '', quantity: 0, reasoning: 'Parse failed', confidence: 0.3 }; }
  }
}

module.exports = new FreeLLMService();