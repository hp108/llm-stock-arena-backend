const express = require('express');
const cors = require('cors');
const axios = require('axios');
const WebSocket = require('ws');
const cron = require('node-cron');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// WebSocket server for real-time updates
const wss = new WebSocket.Server({ port: 8080 });

// LLM trading agents - each gets ₹1000
const llmAgents = [
  {
    id: 1,
    name: 'GPT-4',
    provider: 'OpenAI',
    model: 'gpt-4',
    initialCapital: 1000,
    currentCapital: 1000,
    portfolio: {},
    trades: [],
    color: '#10a37f'
  },
  {
    id: 2,
    name: 'Claude-3',
    provider: 'Anthropic',
    model: 'claude-3-sonnet-20240229',
    initialCapital: 1000,
    currentCapital: 1000,
    portfolio: {},
    trades: [],
    color: '#d97757'
  },
  {
    id: 3,
    name: 'Gemini',
    provider: 'Google',
    model: 'gemini-pro',
    initialCapital: 1000,
    currentCapital: 1000,
    portfolio: {},
    trades: [],
    color: '#4285f4'
  },
  {
    id: 4,
    name: 'Llama-2',
    provider: 'Meta',
    model: 'llama-2-70b-chat',
    initialCapital: 1000,
    currentCapital: 1000,
    portfolio: {},
    trades: [],
    color: '#ff6b35'
  }
];

// Mock stock prices and metadata
const stockData = {
  'AAPL': { 
    price: 150 + Math.random() * 20, 
    market: 'NASDAQ', 
    sector: 'Technology',
    company: 'Apple Inc.'
  },
  'GOOGL': { 
    price: 120 + Math.random() * 15, 
    market: 'NASDAQ', 
    sector: 'Technology',
    company: 'Alphabet Inc.'
  },
  'MSFT': { 
    price: 350 + Math.random() * 30, 
    market: 'NASDAQ', 
    sector: 'Technology',
    company: 'Microsoft Corp.'
  },
  'TSLA': { 
    price: 200 + Math.random() * 50, 
    market: 'NASDAQ', 
    sector: 'Automotive',
    company: 'Tesla Inc.'
  },
  'AMZN': { 
    price: 130 + Math.random() * 20, 
    market: 'NASDAQ', 
    sector: 'E-commerce',
    company: 'Amazon.com Inc.'
  }
};

const stockPrices = {};
Object.keys(stockData).forEach(symbol => {
  stockPrices[symbol] = stockData[symbol].price;
});

// Get trading decision from specific LLM
const getLLMDecision = async (agent) => {
  try {
    const prompt = `You are a trading bot with ₹${agent.currentCapital} remaining.
Current portfolio: ${JSON.stringify(agent.portfolio)}
Current stock prices: ${JSON.stringify(stockPrices)}

Available stocks: AAPL, GOOGL, MSFT, TSLA, AMZN
Make a trading decision (BUY/SELL/HOLD). Be conservative with quantities.

Return ONLY JSON format: {action: "BUY/SELL/HOLD", symbol: "SYMBOL", quantity: number, reasoning: "brief reasoning"}`;

    let response;

    if (agent.provider === 'OpenAI') {
      response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: agent.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 100,
        temperature: 0.3
      }, {
        headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` }
      });
      
      const content = response.data.choices[0].message.content;
      return JSON.parse(content.match(/\{[^}]+\}/)[0]);
      
    } else if (agent.provider === 'Anthropic') {
      response = await axios.post('https://api.anthropic.com/v1/messages', {
        model: agent.model,
        max_tokens: 100,
        messages: [{ role: 'user', content: prompt }]
      }, {
        headers: { 
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        }
      });
      
      const content = response.data.content[0].text;
      return JSON.parse(content.match(/\{[^}]+\}/)[0]);
      
    } else if (agent.provider === 'Google') {
      response = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/${agent.model}:generateContent?key=${process.env.GOOGLE_API_KEY}`, {
        contents: [{ parts: [{ text: prompt }] }]
      });
      
      const content = response.data.candidates[0].content.parts[0].text;
      return JSON.parse(content.match(/\{[^}]+\}/)[0]);
      
    } else if (agent.provider === 'Meta') {
      // Fallback for Llama-2 using Replicate
      response = await axios.post('https://api.replicate.com/v1/predictions', {
        version: "meta/llama-2-70b-chat:02e509c789964a7c876db930c13b291d43504a2801752d4d6c53100c55f1d4aa",
        input: { prompt }
      }, {
        headers: { 
          'Authorization': `Token ${process.env.REPLICATE_API_KEY}`
        }
      });
    }

  } catch (error) {
    console.error(`${agent.name} API Error:`, error.message);
    
    // Fallback decisions
    const fallbackStrategies = {
      'GPT-4': { action: 'BUY', symbol: 'AAPL', quantity: 2, reasoning: 'GPT: Systematic buy' },
      'Claude-3': { action: 'HOLD', symbol: '', quantity: 0, reasoning: 'Claude: Risk assessment' },
      'Gemini': { action: 'BUY', symbol: 'GOOGL', quantity: 1, reasoning: 'Gemini: Data-driven' },
      'Llama-2': { action: 'SELL', symbol: 'MSFT', quantity: 1, reasoning: 'Llama: Pattern detected' }
    };
    
    return fallbackStrategies[agent.name] || { action: 'HOLD', symbol: '', quantity: 0, reasoning: 'Error - hold' };
  }
};

// Execute trade for agent
const executeTrade = (agent, decision) => {
  if (decision.action === 'HOLD' || !decision.symbol) return;
  
  const stockPrice = stockPrices[decision.symbol];
  const stockInfo = stockData[decision.symbol];
  const tradeValue = decision.quantity * stockPrice;
  
  if (decision.action === 'BUY' && tradeValue <= agent.currentCapital) {
    agent.currentCapital -= tradeValue;
    agent.portfolio[decision.symbol] = (agent.portfolio[decision.symbol] || 0) + decision.quantity;
    
    // Track buy prices for P&L calculation
    if (!agent.buyPrices) agent.buyPrices = {};
    if (!agent.buyPrices[decision.symbol]) {
      agent.buyPrices[decision.symbol] = [];
    }
    agent.buyPrices[decision.symbol].push({
      quantity: decision.quantity,
      price: stockPrice,
      timestamp: new Date().toISOString()
    });
    
    agent.trades.push({
      type: 'BUY',
      symbol: decision.symbol,
      quantity: decision.quantity,
      price: stockPrice,
      total: tradeValue,
      reasoning: decision.reasoning,
      timestamp: new Date().toISOString(),
      market: stockInfo.market,
      sector: stockInfo.sector,
      company: stockInfo.company,
      strategy: getTradingStrategy(agent.name, decision.reasoning),
      agentName: agent.name,
      agentColor: agent.color
    });
    
  } else if (decision.action === 'SELL' && agent.portfolio[decision.symbol] >= decision.quantity) {
    agent.currentCapital += tradeValue;
    agent.portfolio[decision.symbol] -= decision.quantity;
    
    // Calculate average buy price for P&L
    let avgBuyPrice = stockPrice; // fallback
    if (agent.buyPrices && agent.buyPrices[decision.symbol] && agent.buyPrices[decision.symbol].length > 0) {
      const totalCost = agent.buyPrices[decision.symbol].reduce((sum, buy) => sum + (buy.price * buy.quantity), 0);
      const totalShares = agent.buyPrices[decision.symbol].reduce((sum, buy) => sum + buy.quantity, 0);
      avgBuyPrice = totalCost / totalShares;
      
      // Remove sold shares from buy tracking
      let remainingToSell = decision.quantity;
      agent.buyPrices[decision.symbol] = agent.buyPrices[decision.symbol].filter(buy => {
        if (remainingToSell <= 0) return true;
        if (buy.quantity <= remainingToSell) {
          remainingToSell -= buy.quantity;
          return false;
        } else {
          buy.quantity -= remainingToSell;
          remainingToSell = 0;
          return true;
        }
      });
    }
    
    agent.trades.push({
      type: 'SELL',
      symbol: decision.symbol,
      quantity: decision.quantity,
      price: stockPrice,
      buyPrice: avgBuyPrice,
      total: tradeValue,
      reasoning: decision.reasoning,
      timestamp: new Date().toISOString(),
      market: stockInfo.market,
      sector: stockInfo.sector,
      company: stockInfo.company,
      strategy: getTradingStrategy(agent.name, decision.reasoning),
      agentName: agent.name,
      agentColor: agent.color
    });
  }
};

// Get trading strategy based on reasoning
const getTradingStrategy = (agentName, reasoning) => {
  const lowerReasoning = reasoning.toLowerCase();
  
  if (lowerReasoning.includes('momentum') || lowerReasoning.includes('trend')) return 'Momentum';
  if (lowerReasoning.includes('value') || lowerReasoning.includes('undervalued')) return 'Value Investing';
  if (lowerReasoning.includes('technical') || lowerReasoning.includes('indicator')) return 'Technical Analysis';
  if (lowerReasoning.includes('fundamental') || lowerReasoning.includes('earnings')) return 'Fundamental Analysis';
  if (lowerReasoning.includes('ai') || lowerReasoning.includes('ml')) return 'AI-Powered';
  if (lowerReasoning.includes('risk') || lowerReasoning.includes('conservative')) return 'Risk Management';
  
  // Agent-specific default strategies
  const agentStrategies = {
    'GPT-4': 'Analytical Trading',
    'Claude-3': 'Cautious Growth',
    'Gemini': 'Data-Driven',
    'Llama-2': 'Quantitative'
  };
  
  return agentStrategies[agentName] || 'Systematic Trading';
};

// Calculate total portfolio value
const calculatePortfolioValue = (agent) => {
  let stockValue = 0;
  for (const [symbol, quantity] of Object.entries(agent.portfolio)) {
    stockValue += quantity * stockPrices[symbol];
  }
  return agent.currentCapital + stockValue;
};

// Broadcast updates to WebSocket clients
const broadcastUpdate = () => {
  const updateData = {
    agents: llmAgents.map(agent => ({
      ...agent,
      totalValue: calculatePortfolioValue(agent),
      profitLoss: calculatePortfolioValue(agent) - agent.initialCapital,
      profitLossPercent: ((calculatePortfolioValue(agent) - agent.initialCapital) / agent.initialCapital * 100).toFixed(2)
    })),
    timestamp: new Date().toISOString()
  };
  
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(updateData));
    }
  });
};

// Update stock prices with realistic movements
const updateStockPrices = () => {
  Object.keys(stockData).forEach(symbol => {
    const change = (Math.random() - 0.5) * 0.02; // ±2% change
    stockData[symbol].price = Math.max(10, stockData[symbol].price * (1 + change));
    stockPrices[symbol] = stockData[symbol].price;
  });
};

// Trading decisions every 30 seconds
cron.schedule('*/30 * * * * *', async () => {
  console.log('🤖 Making trading decisions...');
  
  // Update stock prices first
  updateStockPrices();
  
  for (const agent of llmAgents) {
    const decision = await getLLMDecision(agent);
    executeTrade(agent, decision);
    console.log(`${agent.name}: ${decision.action} ${decision.symbol || ''} - ${decision.reasoning}`);
  }
  
  broadcastUpdate();
});

// API Routes
app.get('/api/agents', (req, res) => {
  const agentsWithValues = llmAgents.map(agent => ({
    ...agent,
    totalValue: calculatePortfolioValue(agent),
    profitLoss: calculatePortfolioValue(agent) - agent.initialCapital,
    profitLossPercent: ((calculatePortfolioValue(agent) - agent.initialCapital) / agent.initialCapital * 100).toFixed(2)
  }));
  res.json(agentsWithValues);
});

app.get('/api/trades', (req, res) => {
  const allTrades = llmAgents.flatMap(agent => 
    agent.trades.map(trade => ({
      ...trade,
      agentName: trade.agentName || agent.name,
      agentColor: trade.agentColor || agent.color
    }))
  ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json(allTrades);
});

app.get('/api/leaderboard', (req, res) => {
  const leaderboard = llmAgents.map(agent => ({
    name: agent.name,
    provider: agent.provider,
    totalValue: calculatePortfolioValue(agent),
    profitLoss: calculatePortfolioValue(agent) - agent.initialCapital,
    profitLossPercent: ((calculatePortfolioValue(agent) - agent.initialCapital) / agent.initialCapital * 100).toFixed(2),
    totalTrades: agent.trades.length,
    color: agent.color
  })).sort((a, b) => b.totalValue - a.totalValue);
  res.json(leaderboard);
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// WebSocket handler
wss.on('connection', (ws) => {
  console.log('🔗 Client connected to trading updates');
  broadcastUpdate();
  
  ws.on('close', () => {
    console.log('❌ Client disconnected');
  });
});

app.listen(PORT, () => {
  console.log(`🚀 LLM Trading Server running on port ${PORT}`);
  console.log(`📡 WebSocket server running on port 8080`);
  console.log(`💰 4 LLMs competing with ₹1000 each`);
});