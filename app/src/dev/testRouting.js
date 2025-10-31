/**
 * Test Intelligent Routing System
 * 
 * This script demonstrates the query router in action,
 * classifying different types of queries and selecting optimal models.
 */

import { routeQuery, QueryCategory, estimateCostSavings } from "../utils/queryRouter.js";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

// Test queries covering all categories
const testQueries = [
  // Coding queries
  {
    category: 'coding',
    query: "How do I implement a binary search tree in Python?",
    history: []
  },
  {
    category: 'coding',
    query: "My React component is throwing an error. Can you help debug it?",
    history: [
      new HumanMessage("I'm building a web app"),
      new AIMessage("That's great! What framework are you using?")
    ]
  },
  {
    category: 'coding',
    query: "What's the time complexity of quicksort?",
    history: []
  },
  
  // General queries
  {
    category: 'general',
    query: "Hi! How are you?",
    history: []
  },
  {
    category: 'general',
    query: "What's the capital of France?",
    history: []
  },
  {
    category: 'general',
    query: "Can you recommend a good movie?",
    history: []
  },
  
  // Heavy work queries
  {
    category: 'heavy',
    query: "Write a professional resume for a senior software engineer with 10 years experience",
    history: []
  },
  {
    category: 'heavy',
    query: "I need to research the impact of artificial intelligence on healthcare",
    history: []
  },
  {
    category: 'heavy',
    query: "Compare and contrast different database architectures in detail",
    history: []
  },
];

async function runTests() {
  console.log('\n🔀 Testing Intelligent Routing System\n');
  console.log('='.repeat(80));
  
  let totalTime = 0;
  const results = {
    correct: 0,
    total: testQueries.length,
    categories: {
      coding: { total: 0, correct: 0 },
      general: { total: 0, correct: 0 },
      heavy: { total: 0, correct: 0 },
    }
  };
  
  for (const test of testQueries) {
    console.log(`\n📝 Query: "${test.query.substring(0, 60)}${test.query.length > 60 ? '...' : ''}"`);
    console.log(`   Expected: ${test.category}`);
    
    try {
      const startTime = Date.now();
      const { model, category, reasoning, routingTime } = await routeQuery(test.query, test.history);
      const elapsed = Date.now() - startTime;
      
      totalTime += elapsed;
      results.categories[test.category].total++;
      
      const isCorrect = category === test.category;
      if (isCorrect) {
        results.correct++;
        results.categories[test.category].correct++;
      }
      
      console.log(`   Routed to: ${category} ${isCorrect ? '✅' : '❌'}`);
      console.log(`   Model: ${model}`);
      console.log(`   Reasoning: ${reasoning}`);
      console.log(`   Time: ${elapsed}ms (routing: ${routingTime}ms)`);
      
      // Show cost savings estimate
      const tokenEstimate = 2000; // Assume 2k tokens for example
      const savings = estimateCostSavings(category, tokenEstimate);
      console.log(`   Cost (2k tokens): ${savings.actualPrice} vs ${savings.baselinePrice} (save ${savings.savingsPercent})`);
      
    } catch (error) {
      console.error(`   ❌ Error:`, error.message);
    }
    
    console.log('─'.repeat(80));
  }
  
  // Summary
  console.log('\n📊 Results Summary\n');
  console.log(`Accuracy: ${results.correct}/${results.total} (${(results.correct / results.total * 100).toFixed(1)}%)`);
  console.log(`Average routing time: ${(totalTime / results.total).toFixed(0)}ms\n`);
  
  console.log('Per-category accuracy:');
  for (const [category, stats] of Object.entries(results.categories)) {
    if (stats.total > 0) {
      const accuracy = (stats.correct / stats.total * 100).toFixed(1);
      console.log(`  ${category}: ${stats.correct}/${stats.total} (${accuracy}%)`);
    }
  }
  
  console.log('\n✅ Routing test complete!\n');
  
  // Cost analysis
  console.log('💰 Cost Analysis (assuming 2000 tokens per query):\n');
  
  const scenarios = [
    {
      name: 'Without Routing (all GPT-4)',
      categories: { coding: 0, general: 0, heavy: 0 },
      avgCost: 0.010
    },
    {
      name: 'With Routing (optimized)',
      categories: results.categories,
      avgCost: null // Calculate based on distribution
    }
  ];
  
  // Calculate weighted average cost with routing
  const categoryRatio = {
    coding: results.categories.coding.total / results.total,
    general: results.categories.general.total / results.total,
    heavy: results.categories.heavy.total / results.total,
  };
  
  const categoryCosts = {
    coding: 0.006,    // Claude pricing
    general: 0.00028, // DeepSeek pricing
    heavy: 0.010,     // GPT-4 pricing
  };
  
  const avgRoutedCost = 
    categoryRatio.coding * categoryCosts.coding +
    categoryRatio.general * categoryCosts.general +
    categoryRatio.heavy * categoryCosts.heavy;
  
  const savings = ((0.010 - avgRoutedCost) / 0.010 * 100).toFixed(1);
  
  console.log(`Without routing: $0.010000 per query (always GPT-4)`);
  console.log(`With routing:    $${avgRoutedCost.toFixed(6)} per query`);
  console.log(`Savings:         ${savings}% 💰\n`);
  
  console.log('Category distribution:');
  console.log(`  Coding (${(categoryRatio.coding * 100).toFixed(1)}%):  ${categoryCosts.coding.toFixed(6)} per query`);
  console.log(`  General (${(categoryRatio.general * 100).toFixed(1)}%): ${categoryCosts.general.toFixed(6)} per query`);
  console.log(`  Heavy (${(categoryRatio.heavy * 100).toFixed(1)}%):   ${categoryCosts.heavy.toFixed(6)} per query`);
}

// Run tests
console.log('\n⏳ Starting routing tests...\n');
runTests().catch(console.error);

