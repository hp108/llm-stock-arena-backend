// Smart Local AI Trading - Works 100% FREE without any API keys!
class SmartLocalTrading {
  constructor() {
    this.traders = {
      'ChatGPT': this.momentumTrader.bind(this),
      'Claude': this.valueTrader.bind(this),
      'Grok': this.volatilityTrader.bind(this),
      'DeepSeek': this.techTrader.bind(this)
    };
  }

  getTradingDecision(agent, stockData, portfolio) {
    const trader = this.traders[agent.name] || this.defaultTrader;
    return trader(agent, stockData, portfolio);
  }

  // ChatGPT - Momentum Strategy
  momentumTrader(agent, stocks, portfolio) {
    const hasPosition = Object.values(portfolio).reduce((a, b) => a + b, 0) > 0;
    const cash = agent.currentCapital;
    
    // Find best momentum stocks
    const sorted = [...stocks].sort((a, b) => b.dayChangePercent - a.dayChangePercent);
    const bestMomentum = sorted.find(s => s.dayChangePercent > 0.5);
    const worstDrop = sorted.find(s => s.dayChangePercent < -2);
    
    if (hasPosition) {
      // Check stop loss / take profit
      for (const [symbol, qty] of Object.entries(portfolio)) {
        const stock = stocks.find(s => s.symbol === symbol);
        if (stock) {
          if (stock.dayChangePercent > 4) {
            return { action: 'SELL', symbol, quantity: qty, reasoning: `ChatGPT: Take profit on ${symbol} after +${stock.dayChangePercent.toFixed(1)}% gain`, confidence: 0.85 };
          }
          if (stock.dayChangePercent < -3) {
            return { action: 'SELL', symbol, quantity: qty, reasoning: `ChatGPT: Stop loss on ${symbol} after -${Math.abs(stock.dayChangePercent).toFixed(1)}% drop`, confidence: 0.9 };
          }
        }
      }
    }
    
    if (!hasPosition && bestMomentum) {
      const qty = Math.floor((cash * 0.25) / bestMomentum.currentPrice);
      if (qty > 0) {
        return { action: 'BUY', symbol: bestMomentum.symbol, quantity: qty, reasoning: `ChatGPT: Strong momentum on ${bestMomentum.symbol} (+${bestMomentum.dayChangePercent.toFixed(1)}%). Entering position.`, confidence: 0.75 };
      }
    }
    
    return { action: 'HOLD', symbol: '', quantity: 0, reasoning: 'ChatGPT: No clear momentum signal. Waiting.', confidence: 0.5 };
  }

  // Claude - Value Strategy  
  valueTrader(agent, stocks, portfolio) {
    const hasPosition = Object.values(portfolio).reduce((a, b) => a + b, 0) > 0;
    const cash = agent.currentCapital;
    
    // Find undervalued stocks (low price, positive change)
    const valueStocks = stocks.filter(s => s.currentPrice < 200 && s.dayChangePercent > -1).sort((a, b) => a.currentPrice - b.currentPrice);
    
    if (hasPosition) {
      for (const [symbol, qty] of Object.entries(portfolio)) {
        const stock = stocks.find(s => s.symbol === symbol);
        if (stock && stock.dayChangePercent > 2.5) {
          return { action: 'SELL', symbol, quantity: Math.ceil(qty/2), reasoning: `Claude: Taking partial profits on ${symbol} (+${stock.dayChangePercent.toFixed(1)}%)`, confidence: 0.8 };
        }
      }
    }
    
    if (!hasPosition && valueStocks.length > 0) {
      const pick = valueStocks[Math.floor(Math.random() * Math.min(3, valueStocks.length))];
      const qty = Math.floor((cash * 0.3) / pick.currentPrice);
      if (qty > 0) {
        return { action: 'BUY', symbol: pick.symbol, quantity: qty, reasoning: `Claude: Value play on ${pick.symbol} at ₹${pick.currentPrice.toFixed(2)}. Undervalued entry.`, confidence: 0.7 };
      }
    }
    
    return { action: 'HOLD', symbol: '', quantity: 0, reasoning: 'Claude: Searching for value opportunities.', confidence: 0.5 };
  }

  // Grok - High Risk/High Reward
  volatilityTrader(agent, stocks, portfolio) {
    const hasPosition = Object.values(portfolio).reduce((a, b) => a + b, 0) > 0;
    const cash = agent.currentCapital;
    
    // Find most volatile
    const volatile = [...stocks].sort((a, b) => Math.abs(b.dayChangePercent) - Math.abs(a.dayChangePercent));
    const mostVolatile = volatile[0];
    
    if (hasPosition) {
      for (const [symbol, qty] of Object.entries(portfolio)) {
        const stock = stocks.find(s => s.symbol === symbol);
        if (stock && (stock.dayChangePercent > 5 || stock.dayChangePercent < -5)) {
          return { action: 'SELL', symbol, quantity: qty, reasoning: `Grok: Extreme move on ${symbol} (${stock.dayChangePercent>0?'+':''}${stock.dayChangePercent.toFixed(1)}%). Taking action.`, confidence: 0.9 };
        }
      }
    }
    
    if (!hasPosition && mostVolatile) {
      const qty = Math.floor((cash * 0.3) / mostVolatile.currentPrice);
      if (qty > 0) {
        return { action: 'BUY', symbol: mostVolatile.symbol, quantity: qty, reasoning: `Grok: Volatility play on ${mostVolatile.symbol} (${mostVolatile.dayChangePercent>0?'+':''}${mostVolatile.dayChangePercent.toFixed(1)}%). High risk, high reward.`, confidence: 0.65 };
      }
    }
    
    return { action: 'HOLD', symbol: '', quantity: 0, reasoning: 'Grok: Scanning for high volatility opportunities.', confidence: 0.5 };
  }

  // DeepSeek - Tech/AI Focused
  techTrader(agent, stocks, portfolio) {
    const hasPosition = Object.values(portfolio).reduce((a, b) => a + b, 0) > 0;
    const cash = agent.currentCapital;
    
    // Focus on tech/AI stocks
    const techStocks = stocks.filter(s => ['Technology', 'Semiconductor'].includes(s.sector));
    const sortedTech = [...techStocks].sort((a, b) => b.dayChangePercent - a.dayChangePercent);
    
    if (hasPosition) {
      for (const [symbol, qty] of Object.entries(portfolio)) {
        const stock = stocks.find(s => s.symbol === symbol);
        if (stock && stock.dayChangePercent > 2) {
          return { action: 'SELL', symbol, quantity: qty, reasoning: `DeepSeek: Tech rally on ${symbol} (+${stock.dayChangePercent.toFixed(1)}%). Cashing in on sector surge.`, confidence: 0.85 };
        }
        if (stock && stock.dayChangePercent < -2.5) {
          return { action: 'SELL', symbol, quantity: qty, reasoning: `DeepSeek: Tech selloff on ${symbol}. Protecting capital.`, confidence: 0.8 };
        }
      }
    }
    
    if (!hasPosition && sortedTech.length > 0) {
      const best = sortedTech[0];
      const qty = Math.floor((cash * 0.25) / best.currentPrice);
      if (qty > 0) {
        return { action: 'BUY', symbol: best.symbol, quantity: qty, reasoning: `DeepSeek: AI/Tech play on ${best.symbol} (+${best.dayChangePercent.toFixed(1)}%). Leveraging sector expertise.`, confidence: 0.8 };
      }
    }
    
    return { action: 'HOLD', symbol: '', quantity: 0, reasoning: 'DeepSeek: Awaiting optimal tech entry point.', confidence: 0.5 };
  }

  defaultTrader(agent, stocks, portfolio) {
    const cash = agent.currentCapital;
    if (cash > 100 && stocks.length > 0) {
      const random = stocks[Math.floor(Math.random() * stocks.length)];
      const qty = Math.floor((cash * 0.1) / random.currentPrice);
      if (qty > 0) {
        return { action: 'BUY', symbol: random.symbol, quantity: qty, reasoning: `Default: Random pick ${random.symbol}`, confidence: 0.4 };
      }
    }
    return { action: 'HOLD', symbol: '', quantity: 0, reasoning: 'Default: No action', confidence: 0.3 };
  }
}

module.exports = new SmartLocalTrading();