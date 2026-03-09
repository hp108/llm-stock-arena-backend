const axios = require('axios');

// Free LLM Trading Service - Using Groq API
class FreeLLMTrading {
  constructor() {
    this.providers = {
      'ChatGPT': { api: this.callGroq.bind(this), model: 'llama-3.3-70b-versatile' },
      'Claude': { api: this.callGroq.bind(this), model: 'llama-3.2-3b-instant' },
      'Grok': { api: this.callGroq.bind(this), model: 'llama-3.1-8b-instant' },
      'DeepSeek': { api: this.callGroq.bind(this), model: 'deepseek-r1-distill-llama-70b' }
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
    const keys = this.getApiKeys();
    
    // Check if API keys are available
    if (!keys.groq && !keys.openrouter && !keys.nvidia) {
      console.log(`⚠️ No API keys for ${agent.name}, using fallback strategy`);
      return this.getLocalFallback(agent.name, stockData, portfolio, agent.currentCapital);
    }
    
    try {
      // Calculate technical indicators
      const indicators = this.calculateIndicators(stockData, portfolio);
      
      // Build detailed prompt with indicators
      const prompt = this.buildPrompt(agent, stockData, portfolio, indicators);
      
      // Get LLM response
      const provider = this.providers[agent.name];
      if (!provider) throw new Error('Unknown agent');
      
      console.log(`📞 ${agent.name}: Calling LLM API...`);
      const response = await provider.api(prompt, provider.model, agent.name);
      console.log(`✅ ${agent.name}: Got LLM response!`);
      console.log(`🔍 ${agent.name} raw response:`, response.slice(0, 200));
      
      const decision = this.parseDecision(response);
      console.log(`🤖 ${agent.name}: ${decision.action} ${decision.symbol || '-'} (REAL LLM)`);
      return decision;
      
    } catch (error) {
      console.log(`❌ ${agent.name}: LLM API FAILED - ${error.message.slice(0, 100)}`);
      console.log(`🔄 ${agent.name}: Using fallback strategy...`);
      const fallback = this.getLocalFallback(agent.name, stockData, portfolio, agent.currentCapital);
      console.log(`🔄 ${agent.name}: Fallback decision: ${fallback.action} ${fallback.symbol}`);
      return fallback;
    }
  }

  calculateIndicators(stocks, portfolio) {
    return stocks.map(stock => {
      const priceHistory = stock.priceHistory || [];
      let closes = priceHistory.map(p => typeof p === 'number' ? p : p.price).filter(c => c !== null && c !== undefined);
      const volumes = priceHistory.map(p => p.volume || 0).filter(v => v > 0);
      
      const currentPrice = stock.currentPrice || stock.price || 0;
      const dayChange = stock.dayChangePercent || stock.changePercent || 0;
      const volume = stock.volume || 1000000;
      const avgVolume = stock.avgVolume || 1000000;
      
      if (closes.length === 0 && currentPrice > 0) {
        closes = [currentPrice];
        for (let i = 1; i < 24; i++) {
          closes.push(currentPrice * (1 + (Math.random() - 0.5) * 0.02));
        }
      }
      
      const priceData = closes.length > 0 ? closes : [currentPrice || 100];
      
      const sma20 = this.calculateSMA(priceData, Math.min(20, priceData.length));
      const sma50 = this.calculateSMA(priceData, Math.min(50, priceData.length));
      const ema12 = this.calculateEMA(priceData, Math.min(12, priceData.length));
      const ema26 = this.calculateEMA(priceData, Math.min(26, priceData.length));
      
      const rsi = this.calculateRSI(priceData, 14);
      const macd = ema12 - ema26;
      const signalLine = this.calculateEMA([macd], 9);
      const macdHistogram = macd - signalLine;
      
      const bb = this.calculateBollingerBands(priceData, 20);
      const stochastic = this.calculateStochastic(priceData, 14);
      const adx = this.calculateADX(priceData, 14);
      const cci = this.calculateCCI(priceData, 20);
      const williamsR = this.calculateWilliamsR(priceData, 14);
      const obv = this.calculateOBV(priceData, volume);
      
      const volumeRatio = volume / avgVolume;
      const priceMomentum = this.calculateMomentum(priceData, 10);
      const roc = this.calculateROC(priceData, 12);
      
      let overallSignal = 'NEUTRAL';
      let buySignals = 0;
      let sellSignals = 0;
      
      if (rsi < 30) { buySignals++; }
      if (rsi > 70) { sellSignals++; }
      if (macd > 0 && macdHistogram > 0) { buySignals++; }
      if (macd < 0 && macdHistogram < 0) { sellSignals++; }
      if (currentPrice < bb.lower) { buySignals++; }
      if (currentPrice > bb.upper) { sellSignals++; }
      if (sma20 > sma50) { buySignals++; }
      if (sma20 < sma50) { sellSignals++; }
      if (stochastic < 20) { buySignals++; }
      if (stochastic > 80) { sellSignals++; }
      if (adx > 25) {
        if (currentPrice > sma20) { buySignals++; }
        if (currentPrice < sma20) { sellSignals++; }
      }
      
      if (buySignals > sellSignals + 2) overallSignal = 'STRONG_BUY';
      else if (buySignals > sellSignals) overallSignal = 'BUY';
      else if (sellSignals > buySignals + 2) overallSignal = 'STRONG_SELL';
      else if (sellSignals > buySignals) overallSignal = 'SELL';
      
      return {
        symbol: stock.symbol,
        name: stock.name || stock.symbol,
        price: currentPrice,
        change: dayChange.toFixed(2),
        volume: volume,
        volumeRatio: volumeRatio.toFixed(2),
        
        movingAverages: {
          sma20: sma20?.toFixed(2) || 'N/A',
          sma50: sma50?.toFixed(2) || 'N/A',
          ema12: ema12?.toFixed(2) || 'N/A',
          ema26: ema26?.toFixed(2) || 'N/A',
          trend: sma20 > sma50 ? 'BULLISH' : 'BEARISH'
        },
        
        momentum: {
          rsi: rsi?.toFixed(1) || 'N/A',
          rsiSignal: rsi < 30 ? 'OVERSOLD' : rsi > 70 ? 'OVERBOUGHT' : 'NEUTRAL',
          macd: macd?.toFixed(2) || 'N/A',
          macdSignal: macd > 0 ? 'BULLISH' : 'BEARISH',
          macdHistogram: macdHistogram?.toFixed(2) || 'N/A',
          stochastic: stochastic?.toFixed(1) || 'N/A',
          momentum: priceMomentum?.toFixed(2) || 'N/A',
          roc: roc?.toFixed(2) || 'N/A'
        },
        
        volatility: {
          bbUpper: bb.upper?.toFixed(2) || 'N/A',
          bbMiddle: bb.middle?.toFixed(2) || 'N/A',
          bbLower: bb.lower?.toFixed(2) || 'N/A',
          position: currentPrice > bb.upper ? 'ABOVE_BB' : currentPrice < bb.lower ? 'BELOW_BB' : 'WITHIN_BB'
        },
        
        trend: {
          adx: adx?.toFixed(1) || 'N/A',
          adxSignal: adx > 25 ? 'STRONG_TREND' : adx > 15 ? 'MODERATE_TREND' : 'WEAK_TREND',
          cci: cci?.toFixed(1) || 'N/A',
          cciSignal: cci > 100 ? 'OVERBOUGHT' : cci < -100 ? 'OVERSOLD' : 'NEUTRAL',
          williamsR: williamsR?.toFixed(1) || 'N/A'
        },
        
        volumeAnalysis: {
          obv: obv?.toFixed(0) || 'N/A',
          volumeRatio: volumeRatio.toFixed(2),
          volumeSignal: volumeRatio > 1.5 ? 'HIGH_VOLUME' : volumeRatio < 0.5 ? 'LOW_VOLUME' : 'NORMAL'
        },
        
        buySignals,
        sellSignals,
        overallSignal,
        sector: stock.sector || 'Technology'
      };
    });
  }

  calculateSMA(prices, period) {
    if (prices.length < period) return null;
    const slice = prices.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  }

  calculateEMA(prices, period) {
    if (prices.length < period) return null;
    const multiplier = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] - ema) * multiplier + ema;
    }
    return ema;
  }

  calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return null;
    let gains = 0, losses = 0;
    for (let i = prices.length - period; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  calculateBollingerBands(prices, period = 20) {
    const sma = this.calculateSMA(prices, period);
    if (!sma) return { upper: null, middle: null, lower: null };
    
    const slice = prices.slice(-period);
    const variance = slice.reduce((sum, p) => sum + Math.pow(p - sma, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    
    return {
      upper: sma + 2 * stdDev,
      middle: sma,
      lower: sma - 2 * stdDev
    };
  }

  calculateStochastic(prices, period = 14) {
    if (prices.length < period) return null;
    const slice = prices.slice(-period);
    const high = Math.max(...slice);
    const low = Math.min(...slice);
    const close = prices[prices.length - 1];
    if (high === low) return 50;
    return ((close - low) / (high - low)) * 100;
  }

  calculateADX(prices, period = 14) {
    if (prices.length < period + 1) return null;
    
    let plusDM = 0, minusDM = 0, tr = 0;
    for (let i = prices.length - period; i < prices.length; i++) {
      const high = prices[i];
      const low = prices[i - 1];
      const prevClose = prices[i - 1];
      
      const upMove = high - low;
      const downMove = low - high;
      
      plusDM += upMove > downMove && upMove > 0 ? upMove : 0;
      minusDM += downMove > upMove && downMove > 0 ? downMove : 0;
      tr += Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    }
    
    if (tr === 0) return 0;
    const plusDI = (plusDM / tr) * 100;
    const minusDI = (minusDM / tr) * 100;
    const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100;
    
    return dx;
  }

  calculateCCI(prices, period = 20) {
    if (prices.length < period) return null;
    const sma = this.calculateSMA(prices, period);
    if (!sma) return 0;
    
    const slice = prices.slice(-period);
    const meanDeviation = slice.reduce((sum, p) => sum + Math.abs(p - sma), 0) / period;
    if (meanDeviation === 0) return 0;
    
    const typicalPrice = (prices[prices.length - 1]);
    return (typicalPrice - sma) / (0.015 * meanDeviation);
  }

  calculateWilliamsR(prices, period = 14) {
    if (prices.length < period) return null;
    const slice = prices.slice(-period);
    const high = Math.max(...slice);
    const low = Math.min(...slice);
    const close = prices[prices.length - 1];
    if (high === low) return -50;
    return ((high - close) / (high - low)) * -100;
  }

  calculateOBV(prices, volume) {
    if (prices.length < 2) return volume || 0;
    const direction = prices[prices.length - 1] > prices[prices.length - 2] ? 1 : -1;
    return (volume || 0) * direction;
  }

  calculateMomentum(prices, period = 10) {
    if (prices.length < period + 1) return null;
    return prices[prices.length - 1] - prices[prices.length - period - 1];
  }

  calculateROC(prices, period = 12) {
    if (prices.length < period + 1) return null;
    return ((prices[prices.length - 1] - prices[prices.length - period - 1]) / prices[prices.length - period - 1]) * 100;
  }

  buildPrompt(agent, stocks, portfolio, indicators) {
    const cash = agent.currentCapital;
    const holdings = Object.entries(portfolio).length > 0 
      ? Object.entries(portfolio).map(([s, q]) => `${s}:${q}`).join(', ') 
      : 'None';
    
    const stockInfo = indicators.map(i => {
      const ma = i.movingAverages;
      const mom = i.momentum;
      const vol = i.volumeAnalysis;
      
      return `${i.symbol}:₹${i.price.toFixed(0)}(${i.change>0?'+':''}${i.change}%) ` +
        `[MA20:${ma.sma20} MA50:${ma.sma50} Trend:${ma.trend}] ` +
        `[RSI:${mom.rsi} MACD:${mom.macd}(${mom.macdSignal}) Stoch:${mom.stochastic}] ` +
        `[Vol:${vol.volumeRatio}x] ` +
        `[Signal:${i.overallSignal} Buy:${i.buySignals} Sell:${i.sellSignals}]`;
    }).join('\n');

    return `You are a stock trader with ₹${cash.toFixed(0)} cash.
Current holdings: ${holdings}

TECHNICAL ANALYSIS DATA:
${stockInfo}

INDICATORS:
- RSI: Below 30=OVERSOLD(BUY), Above 70=OVERBOUGHT(SELL)
- MACD: Positive=BULLISH, Negative=BEARISH
- MA: Price above MA20/MA50 = BULLISH
- Stochastic: Below 20=OVERSOLD, Above 80=OVERBOUGHT
- ADX: Above 25 = strong trend
- Buy/Sell Signals: Count of indicators

RULES:
1. Never buy more than 25% of cash
2. Calculate: floor(cash * 0.25 / price)
3. SELL if: RSI>70, price above upper BB, strong SELL
4. BUY if: RSI<30, MACD bullish, price near lower BB
5. Prefer STRONG_BUY with high signal count

Respond JSON:
{"action":"BUY|SELL|HOLD","symbol":"STOCK","quantity":number,"reasoning":"reason"}`;
  }

  async callGroq(prompt, model, agentName = 'Unknown') {
    const key = this.getApiKeys().groq;
    console.log(`📡 ${agentName}: Calling Groq with model: ${model}`);
    try {
      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 150,
          temperature: 0.3
        },
        {
          headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
          timeout: 30000
        }
      );
      return response.data.choices[0].message.content;
    } catch (error) {
      console.error(`❌ ${agentName} (${model}): Groq Error: ${error.message}`, error.response?.data?.error?.message || '');
      throw error;
    }
  }

  async callGroqDeepSeek(prompt, model) {
    const key = this.getApiKeys().groq;
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.3
      },
      {
        headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
        timeout: 15000
      }
    );
    return response.data.choices[0].message.content;
  }

  async callOpenRouter(prompt, model) {
    const key = this.getApiKeys().openrouter;
    console.log(`📡 Calling OpenRouter API for model: ${model}`);
    try {
      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 200
        },
        {
          headers: { 
            'Authorization': `Bearer ${key}`, 
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:3001',
            'X-Title': 'LLM Trading'
          },
          timeout: 15000
        }
      );
      return response.data.choices[0].message.content;
    } catch (error) {
      console.error(`❌ OpenRouter API Error: ${error.message}`, error.response?.data || '');
      throw error;
    }
  }

  parseDecision(text) {
    try {
      // Find JSON object
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) {
        // Try to extract action from text if no JSON found
        const upperText = text.toUpperCase();
        if (upperText.includes('BUY')) {
          return { action: 'BUY', symbol: 'PYPL', quantity: 1, reasoning: text.slice(0, 100), confidence: 0.5 };
        }
        if (upperText.includes('SELL')) {
          return { action: 'SELL', symbol: 'PYPL', quantity: 1, reasoning: text.slice(0, 100), confidence: 0.5 };
        }
        throw new Error('No JSON found');
      }
      
      const data = JSON.parse(match[0]);
      return {
        action: (data.action?.toUpperCase() || 'HOLD').replace(/[^BUYSELLHOLD]/g, '') || 'HOLD',
        symbol: (data.symbol?.toUpperCase().replace(/[^A-Z]/g, '') || 'PYPL').slice(0, 5),
        quantity: Math.max(1, parseInt(data.quantity) || 10),
        reasoning: (data.reasoning?.toString() || 'No reasoning').slice(0, 100),
        confidence: 0.9
      };
      
    } catch (e) {
      console.log(`⚠️ Parse failed: ${e.message} - Response: ${text.slice(0, 100)}`);
      return { action: 'HOLD', symbol: '', quantity: 0, reasoning: 'Could not parse LLM response', confidence: 0 };
    }
  }

  getLocalFallback(agentName, stocks, portfolio, agentCapital = 2000) {
    const strategies = {
      'ChatGPT': () => {
        const positive = stocks.filter(s => (s.dayChangePercent || s.changePercent || 0) > 0).sort((a, b) => (b.dayChangePercent || b.changePercent || 0) - (a.dayChangePercent || a.changePercent || 0));
        if (positive.length > 0) {
          const stock = positive[0];
          const price = stock.currentPrice || stock.price;
          const qty = Math.floor((agentCapital * 0.2) / price);
          return { action: 'BUY', symbol: stock.symbol, quantity: qty, reasoning: `ChatGPT: ${stock.symbol} showing positive momentum (+${(stock.dayChangePercent || stock.changePercent || 0).toFixed(1)}%)`, confidence: 0.7 };
        }
        return { action: 'HOLD', symbol: '', quantity: 0, reasoning: 'ChatGPT: No clear momentum signals', confidence: 0.5 };
      },
      'Claude': () => {
        const tech = stocks.filter(s => (s.sector || '') === 'Technology').sort((a, b) => (a.currentPrice || a.price) - (b.currentPrice || b.price));
        if (tech.length > 0) {
          const stock = tech[0];
          const price = stock.currentPrice || stock.price;
          const qty = Math.floor((agentCapital * 0.2) / price);
          return { action: 'BUY', symbol: stock.symbol, quantity: qty, reasoning: `Claude: ${stock.symbol} is undervalued tech stock`, confidence: 0.7 };
        }
        return { action: 'HOLD', symbol: '', quantity: 0, reasoning: 'Claude: Analyzing value opportunities', confidence: 0.5 };
      },
      'Grok': () => {
        const volatile = [...stocks].sort((a, b) => Math.abs(b.dayChangePercent || b.changePercent || 0) - Math.abs(a.dayChangePercent || a.changePercent || 0));
        if (volatile.length > 0) {
          const stock = volatile[0];
          const price = stock.currentPrice || stock.price;
          const qty = Math.floor((agentCapital * 0.25) / price);
          return { action: 'BUY', symbol: stock.symbol, quantity: qty, reasoning: `Grok: High volatility play on ${stock.symbol}`, confidence: 0.65 };
        }
        return { action: 'HOLD', symbol: '', quantity: 0, reasoning: 'Grok: Scanning volatility', confidence: 0.5 };
      },
      'DeepSeek': () => {
        const aiStocks = stocks.filter(s => ['NVDA', 'MSFT', 'GOOGL'].includes(s.symbol)).sort((a, b) => (b.dayChangePercent || b.changePercent || 0) - (a.dayChangePercent || a.changePercent || 0));
        if (aiStocks.length > 0) {
          const stock = aiStocks[0];
          const price = stock.currentPrice || stock.price;
          const qty = Math.floor((agentCapital * 0.2) / price);
          return { action: 'BUY', symbol: stock.symbol, quantity: qty, reasoning: `DeepSeek: AI sector play on ${stock.symbol}`, confidence: 0.75 };
        }
        return { action: 'HOLD', symbol: '', quantity: 0, reasoning: 'DeepSeek: Awaiting AI sector entry', confidence: 0.5 };
      }
    };
    return (strategies[agentName] || (() => ({ action: 'HOLD', symbol: '', quantity: 0, reasoning: 'No strategy', confidence: 0.5 })))();
  }
}

module.exports = new FreeLLMTrading();