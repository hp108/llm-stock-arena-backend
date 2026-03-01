const mongoose = require('mongoose');

const TradeSchema = new mongoose.Schema({
  tradeId: {
    type: Number,
    unique: true,
    default: () => Math.floor(Math.random() * 1000000) + 1
  },
  agentId: {
    type: Number,
    ref: 'LLMAgent',
    required: true
  },
  type: {
    type: String,
    enum: ['BUY', 'SELL', 'HOLD'],
    required: true
  },
  symbol: {
    type: String,
    uppercase: true,
    default: ''
  },
  quantity: {
    type: Number,
    default: 0
  },
  price: {
    type: Number,
    default: 0
  },
  total: {
    type: Number,
    default: 0
  },
  buyPrice: {
    type: Number,
    min: 0
  },
  reasoning: {
    type: String,
    maxlength: 500
  },
  strategy: {
    type: String,
    default: 'Systematic Trading'
  },
  market: {
    type: String,
    default: 'NASDAQ'
  },
  sector: {
    type: String,
    default: 'Technology'
  },
  company: {
    type: String,
    default: ''
  },
  profitLoss: {
    type: Number,
    default: 0
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Auto-increment tradeId handled by default function

// Index for performance
TradeSchema.index({ agentId: 1, timestamp: -1 });
TradeSchema.index({ symbol: 1, timestamp: -1 });
TradeSchema.index({ type: 1, timestamp: -1 });

module.exports = mongoose.model('Trade', TradeSchema);