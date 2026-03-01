const axios = require('axios');

class LLMService {
  constructor() {
    this.providers = {
      'OpenAI': this.callOpenAI.bind(this),
      'Anthropic': this.callAnthropic.bind(this),
      'xAI': this.callxAI.bind(this),
      'DeepSeek': this.callDeepSeek.bind(this)
    };
  }

  async getTradingDecision(agent, stockData, portfolio) {
    try {
      const provider = this.providers[agent.provider];
      if (!provider) {
        throw new Error(`Unsupported provider: ${agent.provider}`);
      }

      const prompt = this.buildTradingPrompt(agent, stockData, portfolio);
      const decision = await provider(agent.model, prompt);
      
      return this.parseDecision(decision);
    } catch (error) {
      console.error(`LLM Service Error for ${agent.name} (${agent.provider}):`, error.response?.data?.error?.message || error.message);
      return this.getFallbackDecision(agent);
    }
  }

  buildTradingPrompt(agent, stockData, portfolio) {
    const portfolioStr = Object.entries(portfolio).length > 0 
      ? JSON.stringify(portfolio, null, 2)
      : 'No current holdings';

    const stockDataStr = stockData.map(stock => ({
      symbol: stock.symbol,
      company: stock.name,
      price: stock.currentPrice?.toFixed(2) || 'N/A',
      change: stock.dayChangePercent >= 0 ? `+${stock.dayChangePercent?.toFixed(2)}%` : `${stock.dayChangePercent?.toFixed(2)}%`,
      market: stock.market,
      sector: stock.sector,
      eps: stock.eps?.toFixed(2) || 'N/A',
      peRatio: stock.peRatio?.toFixed(2) || 'N/A',
      dividendYield: stock.dividendYield?.toFixed(2) || '0%',
      rsi: stock.rsi?.toFixed(0) || '50',
      sma20: stock.sma20?.toFixed(2) || 'N/A',
      sma50: stock.sma50?.toFixed(2) || 'N/A',
      macd: stock.macd?.toFixed(2) || '0',
      recommendation: stock.recommendation || 'HOLD',
      beta: stock.beta?.toFixed(2) || '1.0',
      week52Change: stock.week52Change?.toFixed(2) || '0%'
    }));

    return `You are an AI trading bot managing a portfolio with ₹${agent.currentCapital.toFixed(2)} in available capital.

CURRENT PORTFOLIO:
${portfolioStr}

AVAILABLE STOCKS WITH REAL-TIME DATA AND TECHNICAL INDICATORS:
${JSON.stringify(stockDataStr, null, 2)}

TECHNICAL INDICATOR REFERENCE:
- RSI (Relative Strength Index): <30=oversold, >70=overbought
- MACD: Positive = bullish momentum, Negative = bearish
- SMA20/SMA50: Price above moving average = bullish trend
- EPS (Earnings Per Share): Higher = better value
- P/E Ratio: Lower = potentially undervalued (compare within sector)
- Beta: >1 = more volatile than market, <1 = less volatile

TRADING RULES:
1. You must be profitable - focus on minimizing losses and maximizing gains
2. Consider technical indicators (RSI, MACD, moving averages) for timing
3. Consider fundamentals (EPS, P/E ratio, dividend yield)
4. Be conservative with position sizes (max 20% of capital per trade)
5. Diversify across different sectors when possible
6. Sell underperforming positions to cut losses
7. Buy stocks with strong momentum or undervalued fundamentals

Available stocks: ${stockData.map(s => s.symbol).join(', ')}

Make a trading decision based on real-time market data, technical indicators, and fundamental analysis.

Return ONLY a valid JSON object with this exact format:
{
  "action": "BUY" | "SELL" | "HOLD",
  "symbol": "STOCK_SYMBOL" | "",
  "quantity": number,
  "reasoning": "Brief explanation of your decision (max 100 words)",
  "confidence": number (0.1-1.0)
}

If HOLD, symbol should be "" and quantity should be 0.
Be decisive - avoid HOLD unless market conditions are extremely uncertain.`;
  }

  async callOpenAI(model, prompt) {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
      temperature: 0.3,
      response_format: { type: 'json_object' }
    }, {
      headers: { 
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    return response.data.choices[0].message.content;
  }

  async callAnthropic(model, prompt) {
    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model: model,
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    }, {
      headers: { 
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    return response.data.content[0].text;
  }

  async callxAI(model, prompt) {
    const response = await axios.post(
      'https://api.x.ai/v1/chat/completions',
      {
        model: model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.3
      },
      {
        headers: { 
          'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    return response.data.choices[0].message.content;
  }

  async callDeepSeek(model, prompt) {
    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.3
      },
      {
        headers: { 
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    return response.data.choices[0].message.content;
  }

  parseDecision(decisionText) {
    try {
      const decision = JSON.parse(decisionText.match(/\{[^}]+\}/s)[0]);
      
      return {
        action: ['BUY', 'SELL', 'HOLD'].includes(decision.action) ? decision.action : 'HOLD',
        symbol: decision.symbol?.toUpperCase() || '',
        quantity: Math.max(0, Math.floor(decision.quantity) || 0),
        reasoning: decision.reasoning?.substring(0, 500) || 'No reasoning provided',
        confidence: Math.min(1, Math.max(0.1, decision.confidence || 0.5))
      };
    } catch (error) {
      console.error('Failed to parse LLM decision:', error.message);
      throw new Error('Invalid decision format from LLM');
    }
  }

  getFallbackDecision(agent) {
    const fallbackStrategies = {
      'OpenAI': { action: 'BUY', symbol: 'AAPL', quantity: 1, reasoning: 'OpenAI: Safe tech investment', confidence: 0.4 },
      'Claude': { action: 'BUY', symbol: 'GOOGL', quantity: 1, reasoning: 'Claude: Growth potential detected', confidence: 0.4 },
      'Grok': { action: 'SELL', symbol: 'TSLA', quantity: 1, reasoning: 'Grok: Volatility risk detected', confidence: 0.4 },
      'DeepSeek': { action: 'BUY', symbol: 'NVDA', quantity: 1, reasoning: 'DeepSeek: AI sector momentum', confidence: 0.4 }
    };
    
    const fallback = fallbackStrategies[agent.name] || {
      action: 'HOLD', 
      symbol: '', 
      quantity: 0, 
      reasoning: 'System error - hold position', 
      confidence: 0.3
    };

    return {
      ...fallback,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = new LLMService();