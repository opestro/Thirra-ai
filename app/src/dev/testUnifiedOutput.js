/**
 * Test cases for unified output parser
 * Run with: node app/src/dev/testUnifiedOutput.js
 */

import { parseUnifiedOutput, buildUnifiedSystemPrompt, validateParsedOutput, fallbackParse } from '../utils/unifiedOutput.js';

// Test cases with various model outputs
const testCases = [
  {
    name: "Perfect format with title",
    input: `{{{{title}}}}
JavaScript Memory Optimization
{{{{/title}}}}

{{{{summary}}}}
This response explains memory optimization techniques for JavaScript applications.
{{{{/summary}}}}

{{{{response}}}}
Here are several effective memory optimization techniques for JavaScript:

1. Use object pooling for frequently created objects
2. Implement lazy loading for large datasets
3. Clean up event listeners and timers
4. Use WeakMap and WeakSet for temporary references

These techniques can significantly reduce memory usage in your applications.
{{{{/response}}}}`,
    expectTitle: true
  },
  
  {
    name: "Perfect format without title",
    input: `{{{{summary}}}}
A brief explanation of async/await patterns in JavaScript.
{{{{/summary}}}}

{{{{response}}}}
Async/await is syntactic sugar over Promises that makes asynchronous code more readable:

\`\`\`javascript
async function fetchData() {
  try {
    const response = await fetch('/api/data');
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error:', error);
  }
}
\`\`\`

This approach eliminates callback hell and makes error handling cleaner.
{{{{/response}}}}`,
    expectTitle: false
  },
  
  {
    name: "Malformed blocks - missing closing tags",
    input: `{{{{title}}}}
React Performance Tips
{{{{summary}}}}
Tips for optimizing React application performance.
{{{{/summary}}}}

{{{{response}}}}
Here are key React performance optimization strategies:
- Use React.memo for component memoization
- Implement useMemo and useCallback hooks
- Code splitting with React.lazy
- Optimize bundle size with tree shaking`,
    expectTitle: true
  },
  
  {
    name: "Extra content outside blocks",
    input: `Here's some intro text that shouldn't be there.

{{{{title}}}}
Database Indexing
{{{{/title}}}}

{{{{summary}}}}
Explanation of database indexing strategies.
{{{{/summary}}}}

Some random text in the middle.

{{{{response}}}}
Database indexes are data structures that improve query performance:

1. B-tree indexes for range queries
2. Hash indexes for equality lookups
3. Composite indexes for multi-column queries

Choose the right index type based on your query patterns.
{{{{/response}}}}

And some trailing text here.`,
    expectTitle: true
  },
  
  {
    name: "No structured blocks - fallback needed",
    input: `API Design Best Practices

When designing REST APIs, follow these principles:

1. Use meaningful HTTP status codes
2. Implement consistent naming conventions
3. Version your APIs properly
4. Add proper error handling
5. Document everything thoroughly

These practices ensure maintainable and user-friendly APIs.`,
    expectTitle: true
  },
  
  {
    name: "Empty blocks",
    input: `{{{{title}}}}
{{{{/title}}}}

{{{{summary}}}}
{{{{/summary}}}}

{{{{response}}}}
This is the actual response content that should be extracted properly.
{{{{/response}}}}`,
    expectTitle: true
  },
  
  {
    name: "Case insensitive blocks",
    input: `{{{{TITLE}}}}
Machine Learning Basics
{{{{/TITLE}}}}

{{{{Summary}}}}
Introduction to fundamental machine learning concepts.
{{{{/Summary}}}}

{{{{Response}}}}
Machine learning is a subset of AI that enables systems to learn from data:

- Supervised learning uses labeled data
- Unsupervised learning finds patterns in unlabeled data  
- Reinforcement learning learns through trial and error

Start with simple algorithms like linear regression before moving to complex models.
{{{{/Response}}}}`,
    expectTitle: true
  }
];

function runTests() {
  console.log('🧪 Testing Unified Output Parser\n');
  
  let passed = 0;
  let failed = 0;
  
  testCases.forEach((testCase, index) => {
    console.log(`\n📋 Test ${index + 1}: ${testCase.name}`);
    console.log('─'.repeat(50));
    
    try {
      // Test main parser
      const parsed = parseUnifiedOutput(testCase.input);
      const validation = validateParsedOutput(parsed, testCase.expectTitle);
      
      console.log('✅ Parsed Results:');
      console.log(`   Title: ${parsed.hasTitle ? `"${parsed.title}"` : 'None'}`);
      console.log(`   Summary: ${parsed.hasSummary ? `"${parsed.summary?.slice(0, 50)}..."` : 'None'}`);
      console.log(`   Response: ${parsed.response ? `"${parsed.response.slice(0, 50)}..."` : 'None'}`);
      
      if (parsed.errors.length > 0) {
        console.log(`⚠️  Errors: ${parsed.errors.join(', ')}`);
      }
      
      console.log(`📊 Validation: ${validation.isValid ? '✅ Valid' : '❌ Invalid'}`);
      if (!validation.isValid) {
        console.log(`   Missing: ${validation.missingFields.join(', ')}`);
        console.log(`   Critical: ${validation.criticalErrors.join(', ')}`);
      }
      
      // Test fallback parser if main parser failed
      if (!validation.isValid) {
        console.log('\n🔄 Testing fallback parser...');
        const fallback = fallbackParse(testCase.input, testCase.expectTitle);
        console.log(`   Fallback title: ${fallback.hasTitle ? `"${fallback.title}"` : 'None'}`);
        console.log(`   Fallback summary: ${fallback.hasSummary ? `"${fallback.summary?.slice(0, 50)}..."` : 'None'}`);
        console.log(`   Fallback response: ${fallback.response ? `"${fallback.response.slice(0, 50)}..."` : 'None'}`);
      }
      
      passed++;
      
    } catch (error) {
      console.log(`❌ Test failed with error: ${error.message}`);
      failed++;
    }
  });
  
  console.log('\n' + '='.repeat(60));
  console.log(`📈 Test Results: ${passed} passed, ${failed} failed`);
  console.log('='.repeat(60));
  
  // Test prompt generation
  console.log('\n🎯 Testing Prompt Generation');
  console.log('─'.repeat(30));
  
  const promptWithTitle = buildUnifiedSystemPrompt({ 
    needsTitle: true, 
    userInstruction: "Be concise and technical",
    contextText: "Previous discussion about React hooks"
  });
  
  const promptWithoutTitle = buildUnifiedSystemPrompt({ 
    needsTitle: false, 
    userInstruction: "Explain like I'm 5"
  });
  
  console.log('✅ Prompt with title generated');
  console.log('✅ Prompt without title generated');
  console.log(`📏 Prompt with title length: ${promptWithTitle.length} chars`);
  console.log(`📏 Prompt without title length: ${promptWithoutTitle.length} chars`);
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests();
}

export { runTests };