const axios = require('axios');

// Local AI Trading Strategies (100% Free - No API keys needed!)
class LocalAITrading {
  constructor() {
    this.strategies = {
      'ChatGPT': this.chatGPTStrategy.bind(this),
      'Claude': this.claudeStrategy.bind(this),
      'Grok': this.grokStrategy.bind(this),
      'DeepSeek': this.deepSeekStrategy.bind(this)
    };
  }

  getTradingDecision(agent, stockData, portfolio) {
    const strategy = this.strategies[agent.name] || this.defaultStrategy;
    return strategy(agent, stockData, portfolio);
  }

  // ChatGPT Strategy - Balanced Growth
  chatGPTStrategy(agent, stocks, portfolio) {
    const portfolioValue = Object.values(portfolio).reduce((a, b) => a + b, 0);
    const hasPosition = portfolioValue > agent.currentCapital * 0.3;
    
    // Find stocks with positive momentum
    const positiveStocks = stocks.filter(s => s.dayChangePercent > 0).sort((a, b) => b.dayChangePercent - a.dayChangePercent);
    
    if (!hasPosition && positiveStocks.length > 0) {
      const best = positiveStocks[0];
      const quantity = Math.floor((agent.currentCapital * 0.2) / best.currentPrice);
      if (quantity > 0) {
        return {
          action: 'BUY',
          symbol: best.symbol,
          quantity,
          reasoning: 'ChatGPT: Strong positive momentum detected in ' + best.symbol + '. Entering strategic position.',
          confidence: 0.75
        };
      }
    } else if (hasPosition) {
      const heldStock = Object.keys(portfolio)[0];
      const stockInfo = stocks.find(s => s.symbol === heldStock);
      if (stockInfo && stockInfo.dayChangePercent < -2) {
        return {
          action: 'SELL',
          symbol: heldStock,
          quantity: portfolio[heldStock],
          reasoning: 'ChatGPT: Stop loss triggered on ' + heldStock + ' due to significant drop.',
          confidence: 0.8
        };
      }
    }
    
    return { action: 'HOLD', symbol: '', quantity: 0, reasoning: 'ChatGPT: Waiting for better entry points.', confidence: 0.5 };
  }

  // Claude Strategy - Value Investing
  claudeStrategy(agent, stocks, portfolio) {
    const portfolioValue = Object.values(portfolio).reduce((a, b) => a + b, 0);
    const hasPosition = portfolioValue > 0;
    
    // Look for undervalued stocks (price < 50)
    const valueStocks = stocks.filter(s => s.currentPrice < 100).sort((a, b) => a.currentPrice - b.currentPrice);
    
    if (!hasPosition && valueStocks.length > 0) {
      const best = valueStocks[0];
      const quantity = Math.floor((agent.currentCapital * 0.25) / best.currentPrice);
      if (quantity > 0) {
        return {
          action: 'BUY',
          symbol: best.symbol,
          quantity,
          reasoning: 'Claude: Value opportunity identified in ' + best.symbol + '. Undervalued with growth potential.',
          confidence: 0.7
        };
      }
    } else if (hasPosition) {
      const heldStock = Object.keys(portfolio)[0];
      const stockInfo = stocks.find(s => s.symbol === heldStock);
      if (stockInfo && stockInfo.dayChangePercent > 3) {
        return {
          action: 'SELL',
          symbol: heldStock,
          quantity: Math.ceil(portfolio[heldStock] / 2),
          reasoning: 'Claude: Taking profits on ' + heldStock + ' after strong rally.',
          confidence: 0.75
        };
      }
    }
    
    return { action: 'HOLD', symbol: '', quantity: 0, reasoning: 'Claude: Analyzing market conditions for optimal entry.', confidence: 0.5 };
  }

  // Grok Strategy - High Risk High Reward
  grokStrategy(agent, stocks, portfolio) {
    const portfolioValue = Object.values(portfolio).reduce((a, b) => a + b, 0);
    const hasPosition = portfolioValue > 0;
    
    // Look for high volatility stocks
    const volatileStocks = [...stocks].sort((a, b) => Math.abs(b.dayChangePercent) - Math.abs(a.dayChangePercent));
    
    if (!hasPosition) {
      const best = volatileStocks[0];
      const quantity = Math.floor((agent.currentCapital * 0.3) / best.currentPrice);
      if (quantity > 0) {
        return {
          action: 'BUY',
          symbol: best.symbol,
          quantity,
          reasoning: 'Grok: High volatility detected in ' + best.symbol + '. Capitalizing on market swings.',
          confidence: 0.65
        };
      }
    } else {
      const heldStock = Object.keys(portfolio)[0];
      const stockInfo = stocks.find(s => s.symbol === heldStock);
      if (stockInfo && (stockInfo.dayChangePercent > 4 || stockInfo.dayChangePercent < -4)) {
        return {
          action: 'SELL',
          symbol: heldStock,
          quantity: portfolio[heldStock],
          reasoning: 'Grok: Extreme movement on ' + heldStock + '. Securing gains/losses now.',
          confidence: 0.85
        };
      }
    }
    
    return { action: 'HOLD', symbol: '', quantity: 0, reasoning: 'Grok: Scanning for high-impact opportunities.', confidence: 0.5 };
  }

  // DeepSeek Strategy - AI/Tech Focused
  deepSeekStrategy(agent, stocks, portfolio) {
    const portfolioValue = Object.values(portfolio).reduce((a, b) => a + b, 0);
    const hasPosition = portfolioValue > 0;
    
    // Focus on tech/semiconductor stocks
    const techStocks = stocks.filter(s => ['Technology', 'Semiconductor'].includes(s.sector));
    const techMovers = techStocks.sort((a, b) => b.dayChangePercent - a.dayChangePercent);
    
    if (!hasPosition && techMovers.length > 0) {
      const best = techMovers[0];
      const quantity = Math.floor((agent.currentCapital * 0.25) / best.currentPrice);
      if (quantity > 0) {
        return {
          action: 'BUY',
          symbol: best.symbol,
          quantity,
          reasoning: 'DeepSeek: AI/tech sector momentum on ' + best.symbol + '. Leveraging sector expertise.',
          confidence: 0.8
        };
      }
    } else if (hasPosition) {
      const heldStock = Object.keys(portfolio)[0];
      const stockInfo = stocks.find(s => s.symbol === heldStock);
      if (stockInfo && stockInfo.dayChangePercent > 2.5) {
        return {
          action: 'SELL',
          symbol: heldStock,
          quantity: portfolio[heldStock],
          reasoning: 'DeepSeek: Tech rally on ' + heldStock + '. Cashing in on sector surge.',
          confidence: 0.8
        };
      }
    }
    
    return { action: 'HOLD', symbol: '', quantity: 0, reasoning: 'DeepSeek: Awaiting optimal tech sector entry.', confidence: 0.5 };
  }

  // Default fallback
  defaultStrategy(agent, stocks, portfolio) {
    const portfolioValue = Object.values(portfolio).reduce((a, b) => a + b, 0);
    if (portfolioValue === 0 && stocks.length > 0) {
      const randomStock = stocks[Math.floor(Math.random() * stocks.length)];
      const quantity = Math.floor((agent.currentCapital * 0.1) / randomStock.currentPrice);
      if (quantity > 0) {
        return {
          action: 'BUY',
          symbol: randomStock.symbol,
          quantity,
          reasoning: 'Default: Diversifying with ' + randomStock.symbol,
          confidence: 0.5
        };
      }
    }
    return { action: 'HOLD', symbol: '', quantity: 0, reasoning: 'Default: No action', confidence: 0.5 };
  }
}

// Export singleton
module.exports = new LocalAITrading();