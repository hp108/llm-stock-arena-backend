const axios = require('axios');
const StockData = require('../models/StockData');

class StockService {
  constructor() {
    this.tradingSymbols = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN', 'META', 'NVDA', 'NFLX', 'PYPL', 'INTC'];
    this.updateInterval = null;
  }

  async initializeStocks() {
    try {
      console.log('🔍 Initializing stock data (Yahoo Finance Free)...');
      for (const symbol of this.tradingSymbols) {
        await this.updateStockPrice(symbol);
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      console.log(`✅ Initialized ${this.tradingSymbols.length} stocks`);
    } catch (error) {
      console.error('Error:', error.message);
      await this.initializeFallbackStocks();
    }
  }

  async updateStockPrice(symbol) {
    try {
        const response = await axios.get(
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`,
        { 
          timeout: 5000,
          params: { interval: '5m', range: '2h' }
        }
      );

      const data = response.data;
      if (data.chart?.result?.[0]) {
        const result = data.chart.result[0];
        const meta = result.meta;
        const price = meta.regularMarketPrice || meta.previousClose;
        const prevClose = meta.chartPreviousClose || meta.previousClose || price;
        
        const timestamps = result.timestamp || [];
        const quote = result.indicators?.quote?.[0] || {};
        const closes = quote.close || [];
        const volumes = quote.volume || [];
        
        const validPrices = closes.filter(c => c !== null);
        const avgVolume = volumes.length > 0 
          ? volumes.filter(v => v !== null).reduce((a, b) => a + b, 0) / volumes.length 
          : 1000000;
        
        const priceHistory = timestamps.map((ts, i) => ({
          timestamp: new Date(ts * 1000),
          close: closes[i] || price,
          volume: volumes[i] || avgVolume
        })).filter(p => p.close !== null);
        
        const priceHistoryArray = priceHistory.slice(-100).map(p => ({
          price: p.close,
          timestamp: p.timestamp
        }));
        
        const stockInfo = {
          symbol: symbol,
          name: this.getCompanyName(symbol),
          currentPrice: price,
          previousClose: prevClose,
          dayChange: price - prevClose,
          dayChangePercent: ((price - prevClose) / prevClose) * 100,
          market: 'NASDAQ',
          sector: this.getSector(symbol),
          priceHistory: priceHistoryArray,
          avgVolume: avgVolume,
          volume: volumes[volumes.length - 1] || avgVolume
        };

        await StockData.findOneAndUpdate(
          { symbol: symbol },
          { $set: stockInfo },
          { upsert: true, returnDocument: 'after' }
        );

        console.log(`📈 ${symbol}: ₹${price.toFixed(2)} (${stockInfo.dayChangePercent >= 0 ? '+' : ''}${stockInfo.dayChangePercent.toFixed(2)}%) [${priceHistory.length} pts]`);
        return;
      }
      throw new Error('Invalid data');
    } catch (error) {
      console.error(`Yahoo error ${symbol}:`, error.message.slice(0, 50));
      await this.getFallbackStockData(symbol);
    }
  }

  getCompanyName(symbol) {
    const names = {
      'AAPL': 'Apple Inc.', 'GOOGL': 'Alphabet Inc.', 'MSFT': 'Microsoft Corp.',
      'TSLA': 'Tesla Inc.', 'AMZN': 'Amazon.com Inc.', 'META': 'Meta Platforms Inc.',
      'NVDA': 'NVIDIA Corp.', 'NFLX': 'Netflix Inc.', 'PYPL': 'PayPal Holdings', 'INTC': 'Intel Corp.'
    };
    return names[symbol] || `${symbol} Corp.`;
  }

  getSector(symbol) {
    const sectors = {
      'AAPL': 'Technology', 'GOOGL': 'Technology', 'MSFT': 'Technology',
      'TSLA': 'Automotive', 'AMZN': 'E-commerce', 'META': 'Technology',
      'NVDA': 'Semiconductor', 'NFLX': 'Entertainment', 'PYPL': 'Fintech', 'INTC': 'Semiconductor'
    };
    return sectors[symbol] || 'Technology';
  }

  async getFallbackStockData(symbol) {
    const existingStock = await StockData.findOne({ symbol });
    const basePrice = existingStock?.currentPrice || (100 + Math.random() * 200);
    const change = (Math.random() - 0.5) * basePrice * 0.02;
    const newPrice = Math.max(10, basePrice + change);
    
    const priceHistoryArray = [];
    for (let i = 0; i < 24; i++) {
      priceHistoryArray.push({
        price: basePrice + (Math.random() - 0.5) * basePrice * 0.02,
        timestamp: new Date(Date.now() - i * 5 * 60 * 1000)
      });
    }
    
    await StockData.findOneAndUpdate(
      { symbol },
      { $set: { 
        symbol, 
        name: this.getCompanyName(symbol), 
        currentPrice: newPrice, 
        previousClose: basePrice, 
        dayChange: newPrice - basePrice, 
        dayChangePercent: ((newPrice - basePrice) / basePrice) * 100, 
        market: 'NASDAQ', 
        sector: this.getSector(symbol),
        priceHistory: priceHistoryArray,
        avgVolume: 1000000,
        volume: 1000000
      }},
      { upsert: true, returnDocument: 'after' }
    );
    console.log(`⚠️ Fallback ${symbol}: ₹${newPrice.toFixed(2)}`);
  }

  async initializeFallbackStocks() {
    for (const symbol of this.tradingSymbols) await this.getFallbackStockData(symbol);
  }

  async getAllStocks() {
    const stocks = await StockData.find({ currentPrice: { $gt: 0 } });
    return stocks.map(s => {
      const obj = s.toObject();
      return { 
        ...obj, 
        price: s.currentPrice, 
        change: s.dayChange, 
        changePercent: s.dayChangePercent,
        priceHistory: obj.priceHistory?.map(p => p.price) || []
      };
    });
  }

  getStockPrices() {
    return StockData.find({ currentPrice: { $gt: 0 } }).then(stocks => {
      const priceMap = {};
      stocks.forEach(s => { priceMap[s.symbol] = s.currentPrice; });
      return priceMap;
    });
  }

  startRealTimeUpdates(intervalMinutes = 5) {
    if (this.updateInterval) clearInterval(this.updateInterval);
    console.log(`🔄 Real-time updates every ${intervalMinutes} min (Yahoo Finance Free)`);
    this.updateAllStocks();
    this.updateInterval = setInterval(() => this.updateAllStocks(), intervalMinutes * 60 * 1000);
  }

  async updateAllStocks() {
    console.log('🔄 Updating stocks...');
    for (const symbol of this.tradingSymbols) {
      await this.updateStockPrice(symbol).catch(e => console.error(e.message));
      await new Promise(r => setTimeout(r, 300));
    }
    console.log('✅ Stock update complete');
  }

  stopRealTimeUpdates() {
    if (this.updateInterval) { clearInterval(this.updateInterval); this.updateInterval = null; }
  }
}

module.exports = new StockService();