const axios = require('axios');
const StockData = require('../models/StockData');

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || '';
const FINNHUB_BASE = 'https://finnhub.io/api/v1';

class StockService {
  constructor() {
    this.tradingSymbols = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN', 'META', 'NVDA', 'NFLX', 'PYPL', 'INTC'];
    this.updateInterval = null;
    this.stockCache = new Map();
    this.lastFetch = 0;
    this.CACHE_DURATION = 5 * 60 * 1000;
  }

  async initializeStocks() {
    try {
      console.log('🔍 Initializing stock data (Finnhub)...');
      
      const existingStocks = await StockData.find({});
      if (existingStocks.length > 0) {
        console.log(`📦 Loaded ${existingStocks.length} stocks from database`);
        existingStocks.forEach(s => {
          this.stockCache.set(s.symbol, s);
        });
        return;
      }
      
      for (const symbol of this.tradingSymbols) {
        await this.updateStockPrice(symbol);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      console.log(`✅ Initialized ${this.tradingSymbols.length} stocks`);
    } catch (error) {
      console.error('Error:', error.message);
      await this.initializeFallbackStocks();
    }
  }

  async getAllStocks() {
    const now = Date.now();
    if (this.stockCache.size > 0 && (now - this.lastFetch) < this.CACHE_DURATION) {
      return Array.from(this.stockCache.values());
    }
    
    try {
      const stocks = await StockData.find({ currentPrice: { $gt: 0 } });
      if (stocks.length > 0) {
        stocks.forEach(s => this.stockCache.set(s.symbol, s));
        this.lastFetch = now;
        return stocks;
      }
    } catch (e) {
      console.log('DB query failed, using cache');
    }
    
    return Array.from(this.stockCache.values());
  }

  async updateStockPrice(symbol) {
    if (!FINNHUB_API_KEY) {
      console.log(`⚠️ No FINNHUB_API_KEY, using fallback`);
      await this.getFallbackStockData(symbol);
      return;
    }

    try {
      const response = await axios.get(
        `${FINNHUB_BASE}/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`,
        { timeout: 5000 }
      );

      const data = response.data;
      if (data.c && data.c > 0) {
        const price = data.c;
        const prevClose = data.pc || price;
        
        const stockInfo = {
          symbol: symbol,
          name: this.getCompanyName(symbol),
          currentPrice: price,
          previousClose: prevClose,
          dayChange: price - prevClose,
          dayChangePercent: prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0,
          market: 'NASDAQ',
          sector: this.getSector(symbol),
          priceHistory: [],
          avgVolume: 1000000,
          volume: 1000000
        };

        await StockData.findOneAndUpdate(
          { symbol: symbol },
          { $set: stockInfo },
          { upsert: true, returnDocument: 'after' }
        );

        this.stockCache.set(symbol, stockInfo);
        console.log(`📈 ${symbol}: ₹${price.toFixed(2)} (${stockInfo.dayChangePercent >= 0 ? '+' : ''}${stockInfo.dayChangePercent.toFixed(2)}%) [Finnhub]`);
        return;
      }
      throw new Error('Invalid Finnhub data');
    } catch (error) {
      console.error(`Finnhub error ${symbol}:`, error.message.slice(0, 50));
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

  getStockPrices() {
    return StockData.find({ currentPrice: { $gt: 0 } }).then(stocks => {
      const priceMap = {};
      stocks.forEach(s => { priceMap[s.symbol] = s.currentPrice; });
      return priceMap;
    });
  }

  startRealTimeUpdates(intervalMinutes = 5) {
    if (this.updateInterval) clearInterval(this.updateInterval);
    console.log(`🔄 Real-time updates every ${intervalMinutes} min (Finnhub)`);
    this.updateAllStocks();
    this.updateInterval = setInterval(() => this.updateAllStocks(), intervalMinutes * 60 * 1000);
  }

  async updateAllStocks() {
    console.log('🔄 Updating stocks...');
    for (const symbol of this.tradingSymbols) {
      await this.updateStockPrice(symbol).catch(e => console.error(e.message));
      await new Promise(r => setTimeout(r, 1000));
    }
    console.log('✅ Stock update complete');
  }

  stopRealTimeUpdates() {
    if (this.updateInterval) { clearInterval(this.updateInterval); this.updateInterval = null; }
  }
}

module.exports = new StockService();
