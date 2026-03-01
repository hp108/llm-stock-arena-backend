const mongoose = require('mongoose');

const LLMAgentSchema = new mongoose.Schema({
  agentId: {
    type: Number,
    unique: true,
    default: () => Math.floor(Math.random() * 10000) + 1
  },
  name: {
    type: String,
    required: true,
    maxlength: 100
  },
  provider: {
    type: String,
    required: true,
    maxlength: 50
  },
  model: {
    type: String,
    required: true,
    maxlength: 100
  },
  initialCapital: {
    type: Number,
    required: true,
    default: 1000,
    min: 100
  },
  currentCapital: {
    type: Number,
    required: true,
    default: 1000,
    min: 0
  },
  portfolio: {
    type: Map,
    of: Number,
    default: new Map()
  },
  totalValue: {
    type: Number,
    default: 1000,
    min: 0
  },
  profitLoss: {
    type: Number,
    default: 0
  },
  profitLossPercent: {
    type: Number,
    default: 0
  },
  totalTrades: {
    type: Number,
    default: 0
  },
  color: {
    type: String,
    required: true,
    default: '#00d4ff'
  },
  buyPrices: {
    type: Map,
    of: [{
      quantity: Number,
      price: Number,
      timestamp: Date
    }],
    default: new Map()
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastDecision: {
    type: String,
    enum: ['BUY', 'SELL', 'HOLD'],
    default: 'HOLD'
  },
  lastDecisionTime: {
    type: Date,
    default: Date.now
  },
  lastError: {
    type: String,
    maxlength: 500
  }
}, {
  timestamps: true
});

// Auto-increment agentId handled by default function

// Index for performance
LLMAgentSchema.index({ totalValue: -1 });
LLMAgentSchema.index({ profitLossPercent: -1 });

// Method to calculate total portfolio value
LLMAgentSchema.methods.calculatePortfolioValue = function(stockPrices) {
  let stockValue = 0;
  for (const [symbol, quantity] of this.portfolio.entries()) {
    if (stockPrices[symbol]) {
      stockValue += quantity * stockPrices[symbol];
    }
  }
  this.totalValue = this.currentCapital + stockValue;
  this.profitLoss = this.totalValue - this.initialCapital;
  this.profitLossPercent = (this.profitLoss / this.initialCapital) * 100;
  return this.totalValue;
};

// Static method to get ranking
LLMAgentSchema.statics.getRankings = function() {
  return this.find({ isActive: true })
    .sort({ totalValue: -1 })
    .select('name provider totalValue profitLoss profitLossPercent totalTrades color');
};

module.exports = mongoose.model('LLMAgent', LLMAgentSchema);