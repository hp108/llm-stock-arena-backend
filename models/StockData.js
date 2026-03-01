const mongoose = require('mongoose');

const StockDataSchema = new mongoose.Schema({
  symbol: {
    type: String,
    required: true,
    uppercase: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  market: {
    type: String,
    required: true,
    default: 'NASDAQ'
  },
  sector: {
    type: String,
    required: true,
    default: 'Technology'
  },
  currentPrice: {
    type: Number,
    required: true,
    min: 0
  },
  previousClose: {
    type: Number,
    required: true,
    min: 0
  },
  dayChange: {
    type: Number,
    default: 0
  },
  dayChangePercent: {
    type: Number,
    default: 0
  },
  volume: {
    type: Number,
    default: 0
  },
  marketCap: {
    type: Number,
    default: 0
  },
  week52High: {
    type: Number,
    min: 0
  },
  week52Low: {
    type: Number,
    min: 0
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
    index: true
  },
  priceHistory: [{
    price: Number,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  eps: { type: Number, default: 0 },
  peRatio: { type: Number, default: 0 },
  dividendYield: { type: Number, default: 0 },
  beta: { type: Number, default: 1 },
  week52Change: { type: Number, default: 0 },
  sma20: { type: Number, default: 0 },
  sma50: { type: Number, default: 0 },
  rsi: { type: Number, default: 50 },
  macd: { type: Number, default: 0 },
  macdSignal: { type: Number, default: 0 },
  targetMeanPrice: { type: Number, default: 0 },
  recommendation: { type: String, default: 'HOLD' },
  earningsPerShare: { type: Number, default: 0 },
  priceToBook: { type: Number, default: 0 },
  priceToSales: { type: Number, default: 0 },
  returnOnEquity: { type: Number, default: 0 },
  debtToEquity: { type: Number, default: 0 }
}, {
  timestamps: true
});

// Index for performance
StockDataSchema.index({ lastUpdated: -1 });

// Method to update price
StockDataSchema.methods.updatePrice = function(newPrice) {
  const oldPrice = this.currentPrice;
  this.currentPrice = newPrice;
  this.dayChange = newPrice - this.previousClose;
  this.dayChangePercent = (this.dayChange / this.previousClose) * 100;
  
  // Keep last 100 price points
  this.priceHistory.push({
    price: newPrice,
    timestamp: new Date()
  });
  
  if (this.priceHistory.length > 100) {
    this.priceHistory.shift();
  }
  
  this.lastUpdated = new Date();
  return this.save();
};

// Static method to get active trading stocks
StockDataSchema.statics.getActiveStocks = function() {
  return this.find({ currentPrice: { $gt: 0 } })
    .select('symbol name market sector currentPrice dayChange dayChangePercent eps peRatio dividendYield beta week52Change sma20 sma50 rsi macd macdSignal targetMeanPrice recommendation earningsPerShare priceToBook priceToSales returnOnEquity debtToEquity')
    .sort({ symbol: 1 });
};

module.exports = mongoose.model('StockData', StockDataSchema);