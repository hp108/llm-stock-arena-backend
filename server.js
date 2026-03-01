const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const cron = require('node-cron');

// WebSocket - only for local server
let WebSocket;
let wss;
const isVercel = process.env.VERCEL === '1';

if (!isVercel) {
  try {
    WebSocket = require('ws');
    wss = new WebSocket.Server({ port: process.env.WS_PORT || 8080 });
  } catch (e) {
    console.log('⚠️ WebSocket not available');
  }
}

// Import services and models
const stockService = require('./services/stockService');
const freeLLMTrading = require('./services/freeLLMTrading');
const LLMAgent = require('./models/LLMAgent');
const Trade = require('./models/Trade');
const StockData = require('./models/StockData');

// Load env vars (optional - will use process.env if .env not available)
try {
  require('dotenv').config();
} catch (e) {
  // Ignore - running on Vercel without .env file
}

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// MongoDB connection with caching for serverless
let cachedDb = null;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/llm_trading';

async function connectDB() {
  if (cachedDb) return cachedDb;
  
  try {
    const db = await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000
    });
    cachedDb = db;
    console.log('🗄️ Connected to MongoDB');
    return db;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    return null;
  }
}

// Initialize trading system
let systemInitialized = false;

async function initializeTradingSystem() {
  if (systemInitialized) return;
  
  try {
    console.log('🚀 Initializing trading system...');
    
    // Initialize stock data
    await stockService.initializeStocks();
    
    // Initialize LLM agents
    await initializeAgents();
    
    // Start real-time updates (every 1 hour) - only on local server
    if (!isVercel) {
      stockService.startRealTimeUpdates(60);
    }
    
    systemInitialized = true;
    console.log('✅ Trading system initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize trading system:', error);
  }
}

// Auto-initialize on serverless (on first request)
async function ensureInitialized() {
  try {
    await connectDB();
    if (!systemInitialized) {
      await initializeTradingSystem();
    }
  } catch (error) {
    console.error('⚠️ Initialization warning:', error.message);
    // Don't fail completely - continue anyway
  }
}

// Initialize LLM agents in database
async function initializeAgents(reset = false) {
  const agentsData = [
    {
      name: 'ChatGPT',
      provider: 'Groq',
      model: 'llama-3.1-70b-versatile',
      color: '#10a37f'
    },
    {
      name: 'Claude',
      provider: 'Groq',
      model: 'mixtral-8x7b-32768',
      color: '#d97757'
    },
    {
      name: 'Grok',
      provider: 'Groq',
      model: 'llama-3.1-8b-instant',
      color: '#4285f4'
    },
    {
      name: 'DeepSeek',
      provider: 'Groq',
      model: 'deepseek-r1-distill-llama-70b',
      color: '#ff6b35'
    }
  ];

  for (const agentData of agentsData) {
    try {
      let agent = await LLMAgent.findOne({ name: agentData.name });
      
      if (!agent || reset) {
        if (agent) {
          await LLMAgent.deleteOne({ _id: agent._id });
        }
        agent = new LLMAgent({
          ...agentData,
          initialCapital: 2000,
          currentCapital: 2000,
          portfolio: new Map(),
          buyPrices: new Map(),
          totalTrades: 0,
          totalValue: 2000,
          profitLoss: 0,
          profitLossPercent: 0,
          lastDecision: 'HOLD',
          isActive: true
        });
        await agent.save();
        console.log(`✅ Created/Reset agent: ${agent.name} with ₹2000`);
      } else {
        console.log(`✅ Agent already exists: ${agent.name}`);
      }
    } catch (error) {
      console.error(`❌ Failed to create agent ${agentData.name}:`, error.message);
    }
  }
}

// Get current stock prices for portfolio valuation
async function getCurrentStockPrices() {
  try {
    const stocks = await StockData.find({ currentPrice: { $gt: 0 } });
    const priceMap = {};
    stocks.forEach(stock => {
      priceMap[stock.symbol] = stock.currentPrice;
    });
    return priceMap;
  } catch (error) {
    console.error('Error getting stock prices:', error.message);
    return {};
  }
}

// Execute trade for agent
async function executeTrade(agent, decision) {
  try {
    // Validate BEFORE saving trade
    const stock = decision.symbol ? await StockData.findOne({ symbol: decision.symbol }) : null;
    
    if (decision.action === 'HOLD' || !decision.symbol) {
      // Record HOLD to history
      const trade = new Trade({
        agentId: agent.agentId,
        type: 'HOLD',
        symbol: '',
        quantity: 0,
        price: 0,
        total: 0,
        reasoning: decision.reasoning || '',
        strategy: getTradingStrategy(decision.reasoning || ''),
        market: 'NASDAQ',
        sector: 'Technology',
        company: '',
        profitLoss: 0,
        timestamp: new Date()
      });
      await trade.save();
      agent.totalTrades += 1;
      agent.lastDecision = 'HOLD';
      agent.lastDecisionTime = new Date();
      await agent.save();
      return { success: true, trade, reason: 'HOLD recorded' };
    }

    if (!stock) {
      return { success: false, reason: `Stock ${decision.symbol} not found` };
    }

    const stockPrice = stock.currentPrice;
    let tradeValue = decision.quantity * stockPrice;
    
    // Convert portfolio to Map if it's an object
    let portfolio = new Map();
    if (agent.portfolio instanceof Map) {
      portfolio = agent.portfolio;
    } else if (typeof agent.portfolio === 'object' && agent.portfolio !== null) {
      for (const [key, value] of Object.entries(agent.portfolio)) {
        portfolio.set(key, value);
      }
    }

    // Check and clamp capital/holdings BEFORE executing
    if (decision.action === 'BUY') {
      // Clamp quantity to what's affordable (use max 25% of capital)
      const maxAffordable = Math.floor((agent.currentCapital * 0.25) / stockPrice);
      if (decision.quantity > maxAffordable) {
        console.log(`⚠️ Adjusting ${agent.name}: quantity ${decision.quantity} → ${maxAffordable} (max affordable)`);
        decision.quantity = maxAffordable;
        decision.reasoning += ' (quantity adjusted to fit capital)';
      }
      if (decision.quantity <= 0) {
        return { success: false, reason: 'Insufficient capital for any shares' };
      }
      tradeValue = decision.quantity * stockPrice;
    } else if (decision.action === 'SELL') {
      const currentHoldings = portfolio.get(decision.symbol) || 0;
      // Clamp sell quantity to what they actually have
      if (decision.quantity > currentHoldings) {
        console.log(`⚠️ Adjusting ${agent.name}: sell quantity ${decision.quantity} → ${currentHoldings}`);
        decision.quantity = currentHoldings;
        decision.reasoning += ' (quantity adjusted to available holdings)';
      }
      if (decision.quantity <= 0) {
        return { success: false, reason: 'No holdings to sell' };
      }
    }

    // Only save trade AFTER validation passes
    const trade = new Trade({
      agentId: agent.agentId,
      type: decision.action,
      symbol: decision.symbol || '',
      quantity: decision.quantity || 0,
      price: stockPrice,
      total: tradeValue,
      reasoning: decision.reasoning || '',
      strategy: getTradingStrategy(decision.reasoning || ''),
      market: stock?.market || 'NASDAQ',
      sector: stock?.sector || 'Technology',
      company: stock?.name || '',
      profitLoss: 0,
      timestamp: new Date()
    });
    
    await trade.save();
    agent.totalTrades += 1;
    agent.lastDecision = decision.action;
    agent.lastDecisionTime = new Date();

    // Execute BUY
    if (decision.action === 'BUY') {
      agent.currentCapital -= tradeValue;
      portfolio.set(decision.symbol, (portfolio.get(decision.symbol) || 0) + decision.quantity);
      agent.portfolio = portfolio;

      // Track buy prices for P&L calculation
      if (!agent.buyPrices) agent.buyPrices = new Map();
      if (typeof agent.buyPrices === 'object' && !(agent.buyPrices instanceof Map)) {
        agent.buyPrices = new Map(Object.entries(agent.buyPrices));
      }
      if (!agent.buyPrices.get(decision.symbol)) {
        agent.buyPrices.set(decision.symbol, []);
      }
      agent.buyPrices.get(decision.symbol).push({
        quantity: decision.quantity,
        price: stockPrice,
        timestamp: new Date()
      });

      await agent.save();
      return { success: true, trade };

    // Execute SELL
    } else if (decision.action === 'SELL') {
      const currentHoldings = portfolio.get(decision.symbol) || 0;
      
      // Calculate average buy price for P&L
      let avgBuyPrice = stockPrice;
      if (agent.buyPrices && agent.buyPrices.get(decision.symbol)) {
        const buys = agent.buyPrices.get(decision.symbol);
        const totalCost = buys.reduce((sum, buy) => sum + (buy.price * buy.quantity), 0);
        const totalShares = buys.reduce((sum, buy) => sum + buy.quantity, 0);
        avgBuyPrice = totalCost / totalShares;

        // Remove sold shares from buy prices
        let remainingToSell = decision.quantity;
        agent.buyPrices.set(decision.symbol, buys.filter(buy => {
          if (remainingToSell <= 0) return true;
          if (buy.quantity <= remainingToSell) {
            remainingToSell -= buy.quantity;
            return false;
          } else {
            buy.quantity -= remainingToSell;
            remainingToSell = 0;
            return true;
          }
        }));
      }

      portfolio.set(decision.symbol, currentHoldings - decision.quantity);
      if (portfolio.get(decision.symbol) === 0) {
        portfolio.delete(decision.symbol);
      }
      agent.portfolio = portfolio;
      agent.currentCapital += tradeValue;

      // Calculate profit/loss
      const profitLoss = (stockPrice - avgBuyPrice) * decision.quantity;
      trade.profitLoss = profitLoss;
      trade.buyPrice = avgBuyPrice;
      await trade.save();

      return { success: true, trade, profitLoss };
    }

    await agent.save();
    return { success: true, trade };

  } catch (error) {
    console.error(`Error executing trade for ${agent.name}:`, error.message);
    return { success: false, reason: error.message };
  }
}

// Get trading strategy based on reasoning
function getTradingStrategy(reasoning) {
  const lowerReasoning = reasoning.toLowerCase(); 
  
  if (lowerReasoning.includes('momentum') || lowerReasoning.includes('trend')) return 'Momentum';
  if (lowerReasoning.includes('value') || lowerReasoning.includes('undervalued')) return 'Value Investing';
  if (lowerReasoning.includes('technical') || lowerReasoning.includes('indicator')) return 'Technical Analysis';
  if (lowerReasoning.includes('fundamental') || lowerReasoning.includes('earnings')) return 'Fundamental Analysis';
  if (lowerReasoning.includes('ai') || lowerReasoning.includes('ml')) return 'AI-Powered';
  if (lowerReasoning.includes('risk') || lowerReasoning.includes('conservative')) return 'Risk Management';
  
  return 'Systematic Trading';
}

// Broadcast updates to WebSocket clients
async function broadcastUpdate() {
  try {
    const agents = await LLMAgent.find({ isActive: true });
    const stockPrices = await getCurrentStockPrices();

    const updateData = agents.map(agent => {
      // Convert Map to object for JSON serialization
      const portfolioObj = {};
      if (agent.portfolio instanceof Map) {
        for (const [key, value] of agent.portfolio.entries()) {
          portfolioObj[key] = value;
        }
      }

      // Calculate profit/loss properly
      let portfolioValue = agent.currentCapital;
      if (agent.portfolio instanceof Map) {
        for (const [symbol, quantity] of agent.portfolio.entries()) {
          portfolioValue += (stockPrices[symbol] || 0) * quantity;
        }
      } else if (typeof agent.portfolio === 'object') {
        for (const [symbol, quantity] of Object.entries(agent.portfolio)) {
          portfolioValue += (stockPrices[symbol] || 0) * quantity;
        }
      }
      
      return {
        id: agent.agentId,
        name: agent.name,
        provider: agent.provider,
        color: agent.color,
        initialCapital: agent.initialCapital,
        currentCapital: agent.currentCapital,
        portfolio: portfolioObj,
        totalValue: portfolioValue,
        profitLoss: portfolioValue - agent.initialCapital,
        profitLossPercent: ((portfolioValue - agent.initialCapital) / agent.initialCapital) * 100,
        totalTrades: agent.totalTrades,
        lastDecision: agent.lastDecision,
        lastDecisionTime: agent.lastDecisionTime
      };
    });

    const message = {
      agents: updateData.sort((a, b) => b.totalValue - a.totalValue),
      timestamp: new Date().toISOString()
    };

    // WebSocket broadcast (local only)
    if (typeof wss !== 'undefined' && typeof WebSocket !== 'undefined') {
      wss.clients.forEach(client => {
        if (client.readyState === 1) { // WebSocket.OPEN = 1
          client.send(JSON.stringify(message));
        }
      });
      console.log(`📡 Broadcasted update to ${wss.clients.size} WebSocket clients`);
    }
  } catch (error) {
    console.error('Error broadcasting update:', error.message);
  }
}

// Trading decisions every 1 hour (local server only)
// On Vercel, use cron-job.org to hit /api/trade-now endpoint
if (!isVercel) {
  cron.schedule('0 * * * *', async () => {
    console.log('🤖 ========== STARTING TRADING CYCLE ==========');
  console.log(`⏰ Time: ${new Date().toISOString()}`);
  
  try {
    const agents = await LLMAgent.find({ isActive: true });
    console.log(`📊 Found ${agents.length} agents: ${agents.map(a => a.name).join(', ')}`);
    
    const stockData = await stockService.getAllStocks();
    console.log(`📈 Loaded ${stockData.length} stocks`);
    
    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i];
      try {
        console.log(`🔄 Processing ${agent.name}...`);
        
        // Convert Map to object for local AI
        const portfolioObj = {};
        if (agent.portfolio instanceof Map) {
          for (const [key, value] of agent.portfolio.entries()) {
            portfolioObj[key] = value;
          }
        }

        const decision = await freeLLMTrading.getTradingDecision(agent, stockData, portfolioObj);
        console.log(`🤖 ${agent.name}: ${decision.action} ${decision.symbol || ''} - ${decision.reasoning}`);
        
        const result = await executeTrade(agent, decision);
        if (result.success) {
          console.log(`✅ ${agent.name} executed ${decision.action} ${decision.symbol}`);
        } else {
          console.log(`❌ ${agent.name} failed: ${result.reason}`);
        }
        
        // More delay between agents to avoid rate limiting
        await new Promise(r => setTimeout(r, 3000));
      } catch (error) {
        console.error(`❌ Error for ${agent.name}:`, error.message);
        agent.lastError = error.message;
        await agent.save();
      }
    }
    
    await broadcastUpdate();
    console.log('🤖 ========== TRADING CYCLE COMPLETE ==========');
  } catch (error) {
    console.error('Error in trading cycle:', error.message);
  }
  });
}

// API Routes
app.get('/api/agents', async (req, res) => {
  try {
    await ensureInitialized();
    const agents = await LLMAgent.find({ isActive: true });
    const stockPrices = await getCurrentStockPrices();
    
    // Get all trades for profit calculation
    const allTrades = await Trade.find({});
    
    const agentsData = agents.map(agent => {
      const portfolioObj = {};
      if (agent.portfolio instanceof Map) {
        for (const [key, value] of agent.portfolio.entries()) {
          portfolioObj[key] = value;
        }
      } else if (typeof agent.portfolio === 'object') {
        Object.assign(portfolioObj, agent.portfolio);
      }

      // Calculate profit/loss based on current portfolio value
      let portfolioValue = agent.currentCapital;
      if (agent.portfolio instanceof Map) {
        for (const [symbol, quantity] of agent.portfolio.entries()) {
          portfolioValue += (stockPrices[symbol] || 0) * quantity;
        }
      } else if (typeof agent.portfolio === 'object') {
        for (const [symbol, quantity] of Object.entries(agent.portfolio)) {
          portfolioValue += (stockPrices[symbol] || 0) * quantity;
        }
      }
      
      // Calculate realized profit/loss from SELL trades
      const agentTrades = allTrades.filter(t => t.agentId === agent.agentId);
      const realizedPnL = agentTrades
        .filter(t => t.type === 'SELL' && t.profitLoss)
        .reduce((sum, t) => sum + t.profitLoss, 0);
      
      return {
        id: agent.agentId,
        name: agent.name,
        provider: agent.provider,
        color: agent.color,
        initialCapital: agent.initialCapital,
        currentCapital: agent.currentCapital,
        portfolio: portfolioObj,
        totalValue: portfolioValue,
        profitLoss: portfolioValue - agent.initialCapital,
        profitLossPercent: ((portfolioValue - agent.initialCapital) / agent.initialCapital) * 100,
        realizedPnL: realizedPnL,
        totalTrades: agent.totalTrades,
        lastDecision: agent.lastDecision,
        lastDecisionTime: agent.lastDecisionTime
      };
    });
    
    agentsData.sort((a, b) => b.totalValue - a.totalValue);
    res.json(agentsData);
  } catch (error) {
    console.error('Error fetching agents:', error.message);
    res.json([]); // Return empty array instead of error
  }
});

app.get('/api/trades', async (req, res) => {
  try {
    await ensureInitialized();
    const limit = parseInt(req.query.limit) || 50;
    const trades = await Trade.find({})
      .sort({ timestamp: -1 })
      .limit(limit);
    
    // Get agent info manually to avoid populate issues
    const agents = await LLMAgent.find({ isActive: true });
    const agentMap = {};
    agents.forEach(agent => {
      agentMap[agent.agentId] = { name: agent.name, color: agent.color };
    });
    
    const formattedTrades = trades.map(trade => ({
      type: trade.type,
      symbol: trade.symbol,
      quantity: trade.quantity,
      price: trade.price,
      buyPrice: trade.buyPrice,
      total: trade.total,
      reasoning: trade.reasoning,
      strategy: trade.strategy,
      market: trade.market,
      sector: trade.sector,
      company: trade.company,
      profitLoss: trade.profitLoss,
      timestamp: trade.timestamp,
      agentName: agentMap[trade.agentId]?.name || 'Unknown',
      agentColor: agentMap[trade.agentId]?.color || '#666666'
    }));
    
    res.json(formattedTrades);
  } catch (error) {
    console.error('Error fetching trades:', error.message);
    // Return empty array instead of error when no trades exist
    res.json([]);
  }
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    await ensureInitialized();
    const agents = await LLMAgent.find({ isActive: true });
    const stockPrices = await getCurrentStockPrices();
    
    const leaderboard = agents.map(agent => {
      let portfolioValue = agent.currentCapital;
      if (agent.portfolio instanceof Map) {
        for (const [symbol, quantity] of agent.portfolio.entries()) {
          portfolioValue += (stockPrices[symbol] || 0) * quantity;
        }
      } else if (typeof agent.portfolio === 'object') {
        for (const [symbol, quantity] of Object.entries(agent.portfolio)) {
          portfolioValue += (stockPrices[symbol] || 0) * quantity;
        }
      }
      
      return {
        id: agent.agentId,
        name: agent.name,
        provider: agent.provider,
        color: agent.color,
        totalValue: portfolioValue,
        profitLoss: portfolioValue - agent.initialCapital,
        profitLossPercent: ((portfolioValue - agent.initialCapital) / agent.initialCapital) * 100,
        totalTrades: agent.totalTrades
      };
    });
    
    leaderboard.sort((a, b) => b.totalValue - a.totalValue);
    res.json(leaderboard);
  } catch (error) {
    console.error('Error fetching leaderboard:', error.message);
    res.json([]);
  }
});

app.get('/api/stocks', async (req, res) => {
  try {
    await ensureInitialized();
    const stocks = await stockService.getAllStocks();
    res.json(stocks);
  } catch (error) {
    console.error('Error fetching stocks:', error.message);
    res.status(500).json({ error: 'Failed to fetch stocks' });
  }
});

// Reset all data and start fresh
app.post('/api/reset', async (req, res) => {
  try {
    await ensureInitialized();
    await Trade.deleteMany({});
    await LLMAgent.deleteMany({});
    
    await initializeAgents(true);
    
    res.json({ success: true, message: 'All data reset successfully. Each agent now has ₹2000.' });
  } catch (error) {
    console.error('Error resetting data:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/health', async (req, res) => {
  await ensureInitialized();
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    serverless: isVercel
  });
});

// Manual trigger for trading cycle
app.post('/api/trade-now', async (req, res) => {
  try {
    await ensureInitialized();
    console.log('🔄 Manual trading trigger...');
    
    const agents = await LLMAgent.find({ isActive: true });
    const stockData = await stockService.getAllStocks();
    const results = [];
    
    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i];
      try {
        console.log(`🔄 Processing ${agent.name}...`);
        
        const portfolioObj = {};
        if (agent.portfolio instanceof Map) {
          for (const [key, value] of agent.portfolio.entries()) {
            portfolioObj[key] = value;
          }
        }

        const decision = await freeLLMTrading.getTradingDecision(agent, stockData, portfolioObj);
        console.log(`🤖 ${agent.name}: ${decision.action} ${decision.symbol || ''}`);
        
        const result = await executeTrade(agent, decision);
        results.push({ agent: agent.name, decision: decision.action, symbol: decision.symbol, success: result.success });
        
        await new Promise(r => setTimeout(r, 3000));
      } catch (error) {
        console.error(`❌ Error for ${agent.name}:`, error.message);
        results.push({ agent: agent.name, error: error.message });
      }
    }
    
    await broadcastUpdate();
    res.json({ success: true, results });
  } catch (error) {
    console.error('Error in manual trade:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// WebSocket handler (local only)
if (typeof wss !== 'undefined') {
  wss.on('connection', (ws) => {
    console.log('🔗 Client connected to trading updates');
    broadcastUpdate();
    
    ws.on('close', () => {
      console.log('❌ Client disconnected');
    });
  });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🔄 Shutting down gracefully...');
  stockService.stopRealTimeUpdates();
  await mongoose.connection.close();
  process.exit(0);
});

// Start server (local only, not on Vercel)

if (!isVercel) {
  app.listen(PORT, () => {
    console.log(`🚀 LLM Trading Server running on port ${PORT}`);
    console.log(`📡 WebSocket server running on port ${WS_PORT}`);
    console.log(`💰 ${4} LLMs competing with ₹2000 each`);
  });
}

// Export for Vercel serverless
module.exports = app;