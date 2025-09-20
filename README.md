# 🛍️ Universal E-commerce Review Analyzer

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white)](https://chrome.google.com/webstore)
[![MIT License](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![AI Powered](https://img.shields.io/badge/AI-Powered-FF6B6B?style=for-the-badge&logo=openai&logoColor=white)](https://openai.com)

**A powerful Chrome extension that analyzes product reviews on ANY e-commerce website and provides AI-powered pros/cons summaries**

Transform your online shopping experience with instant, unbiased insights from thousands of reviews across 25+ e-commerce platforms.

## 🎬 Demo Video

See the extension in action! Watch how it analyzes product reviews and generates AI-powered summaries:

[![Demo Video](https://img.youtube.com/vi/JXsnGzWP9cQ/maxresdefault.jpg)](https://youtu.be/JXsnGzWP9cQ)

**[🎥 Watch Full Demo on YouTube →](https://youtu.be/JXsnGzWP9cQ)**

---

## ⭐ Why Choose This Extension?

- 🌍 **Universal Compatibility** - Works on ANY e-commerce site, not just Amazon
- 🤖 **Multi-AI Support** - Choose from OpenAI, Anthropic, or Google models
- 🔒 **Privacy First** - Your data stays local, no tracking
- ⚡ **Instant Analysis** - Get insights in seconds, not minutes
- 🎯 **Smart Detection** - Automatically finds reviews on any layout

## 🚀 Advanced Features

### Multi-page Analysis

- Safe, consent-gated deep crawling
- Foreground navigation with user visibility
- Resumable crawling with anti-bot detection
- Respects robots.txt and rate limiting

### Smart Caching

- Intelligent caching prevents duplicate API calls
- Cache invalidation based on content changes
- Configurable cache duration and size limits

### Export & Sharing

- Copy results to clipboard
- Export as JSON or markdown
- Shareable summary links

## 🛠️ Development

### Project Structure

```
src/
├── lib/
│   ├── universal_extractor.js    # AI-powered review detection
│   ├── site_database.js          # E-commerce site patterns
│   ├── ai_client.js              # Multi-provider AI interface
│   └── test_cases.js             # Testing framework
├── selectors.js                  # Site-specific selectors
├── content.js                    # Content script
├── background.js                 # Service worker
└── ui/                           # User interface
```

### Getting Started

1. Clone the repository
2. Load extension unpacked in Chrome (`chrome://extensions`)
3. Open any product page with reviews
4. Click extension icon → "Analyze Reviews"
5. Complete the consent modal for multi-page analysis
6. View the AI-generated pros/cons summary

### Key Technologies

- **Chrome Extension Manifest V3**
- **JavaScript ES Modules**
- **AI Provider APIs** (OpenAI, Anthropic, Gemini)
- **CSS Selectors & DOM Analysis**
- **Structured Data Parsing**

## 📈 Performance

### Optimizations

- **⚡ Efficient selector prioritization** - tries specific selectors first
- **🧠 Smart element scoring** - ranks review containers by likelihood
- **🔄 Lazy loading support** - handles dynamic content
- **📊 Batch processing** - groups API calls for efficiency

### Scalability

- **🌐 Works on any site** - not limited to predefined list
- **📱 Mobile responsive** - adapts to different layouts
- **🔧 Extensible architecture** - easy to add new sites and features

## 🤝 Contributing

We welcome contributions! The extension is designed to be easily extensible:

1. **Adding new sites**: Update `site_database.js` with new selectors
2. **Improving detection**: Enhance `universal_extractor.js` algorithms
3. **AI providers**: Add support in `ai_client.js`
4. **Testing**: Add test cases in `test_cases.js`h structured pros and cons.**

## 🌟 Key Features

### 🌍 **Universal E-commerce Support**

Works on **25+ major e-commerce platforms** plus any generic review site:

- **🏪 Marketplaces**: Amazon, eBay, Etsy, AliExpress, Flipkart
- **🛒 Major Retailers**: Walmart, Target, Best Buy, Home epot, Lowe's, Newegg
- **👗 Fashion**: Zara, H&M, Myntra
- **💄 Beauty**: Sephora, Ulta, Nykaa
- **🏠 Specialized**: Wayfair, Overstock, Shopify stores
- **🔄 Generic**: Automatically detects and works on any e-commerce site

### 🧠 **AI-Powered Analysis**

- **Multi-provider AI support**: OpenAI GPT-4, Anthropic Claude, Google Gemini
- **Intelligent review extraction** using advanced heuristics and content analysis
- **Smart rating detection** from stars, text, and visual elements
- **Structured data parsing** (JSON-LD, microdata) for maximum accuracy

### 🎯 **Advanced Detection System**

- **Automatic site recognition** - No configuration needed
- **Site-specific optimizations** for major platforms
- **Universal fallback patterns** that work on unknown sites
- **Content analysis** to identify review sections intelligently

## 🚀 Quick Start

1. **Install the Extension**

   - Load unpacked from `chrome://extensions/`
   - Enable "Developer mode" and click "Load unpacked"
2. **Configure AI Provider** (Optional)

   - Click the extension icon → Settings
   - Choose your preferred AI provider (OpenAI, Anthropic, or Gemini)
   - Add your API key for enhanced analysis
3. **Analyze Reviews**

   - Visit any e-commerce product page
   - Click the extension icon
   - Click "Analyze Reviews"
   - Get instant pros/cons summary!

## 🏗️ Architecture

### Core Components

- **🔍 UniversalReviewExtractor**: AI-powered review detection system
- **📊 SiteDatabase**: Comprehensive database of 25+ e-commerce sites
- **🤖 Multi-provider AI Client**: Unified interface for OpenAI, Anthropic, Gemini
- **🎯 Smart Selectors**: Site-specific CSS selectors with intelligent fallbacks
- **🧪 Testing Suite**: Comprehensive validation and debugging tools

### Technical Features

- **✅ Manifest V3** Chrome extension with modern architecture
- **✅ Content Scripts** with intelligent site detection
- **✅ Background Service Worker** for AI processing
- **✅ Universal Compatibility** works across different site structures
- **✅ Robust Error Handling** with multiple fallback systems
- **✅ Comprehensive Debugging** for troubleshooting and validation

## 🛠️ AI Provider Setup

The extension supports multiple AI providers for enhanced analysis:

### Supported Providers

1. **OpenAI GPT-4** - High-quality analysis with excellent reasoning
2. **Anthropic Claude** - Detailed analysis with safety focus
3. **Google Gemini** - Fast and efficient processing
4. **Local Fallback** - Works offline with deterministic analysis

### Configuration Steps

1. **Open Settings**: Click extension icon → Settings
2. **Choose Provider**: Select your preferred AI provider
3. **Add API Key**:
   - **OpenAI**: Get key from [OpenAI API](https://platform.openai.com/api-keys)
   - **Anthropic**: Get key from [Anthropic Console](https://console.anthropic.com/)
   - **Gemini**: Get key from [AI Studio](https://aistudio.google.com/app/apikey)
4. **Validate**: Click "Validate Key" to test connectivity
5. **Save**: Your settings are stored securely in Chrome

## 🔧 How It Works

### Universal Detection Process

1. **🎯 Site Recognition**: Automatically detects the e-commerce platform
2. **📦 Review Discovery**: Uses multiple methods to find review containers:
   - Site-specific CSS selectors for known platforms
   - Structured data parsing (JSON-LD, microdata)
   - AI-powered content analysis for unknown sites
3. **📝 Text Extraction**: Intelligently extracts review text while filtering noise
4. **⭐ Rating Extraction**: Detects ratings from various formats (stars, numbers, text)
5. **🤖 AI Analysis**: Processes reviews to generate structured pros/cons
6. **📊 Results Display**: Shows summary with support counts and examples

### Intelligent Fallbacks

- **Known Sites**: Uses optimized selectors for best accuracy
- **Unknown Sites**: Applies universal patterns and content analysis
- **No Reviews Found**: Falls back to heuristic text analysis
- **AI Unavailable**: Uses local deterministic summarization

## 🧪 Testing & Debugging

### Built-in Testing Tools

The extension includes comprehensive testing capabilities:

```javascript
// Test universal extractor on any page
const tester = new ReviewExtractorTester();
tester.runTest();

// Run comprehensive test suite
UniversalTestCases.runAllTests();
```

### Debug Mode

Add `?debug=true` to any URL to see detailed extraction analysis:

- Site detection results
- Review container discovery process
- Text extraction statistics
- Performance metrics

## 🔒 Privacy & Security

### Data Protection

- **🔐 API keys** stored locally in Chrome's secure storage
- **🚫 No data collection** - reviews processed locally before AI analysis
- **🛡️ PII redaction** - emails and phone numbers removed before processing
- **⚡ Local fallback** - works completely offline when needed

### Security Features

- **✅ No external dependencies** beyond chosen AI provider
- **✅ Manifest V3** with latest security standards
- **✅ Content Security Policy** prevents code injection
- **✅ Minimal permissions** - only what's needed for functionality

## Development Quick Start

1. Load extension unpacked (`chrome://extensions`).
2. Open a product page with reviews.
3. Use the popup button “Analyze Reviews”.
4. Complete the consent modal; crawl will aggregate up to 30 pages or stop earlier when pages end.
5. View pros/cons overlay. If no API key is set, local fallback summarizer is used.

### Safety Notes

- Frequent commits aid traceability and make rolling back trivial.
- For large refactors, you can request a temporary "work-in-progress" branch; we then squash before merging.
- Force pushes are reserved for: (1) explicit squash request, (2) removing sensitive data accidentally committed.

If you want a different cadence (e.g., only after passing tests), let me know and I'll adjust the workflow or add a pre-commit test gate.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

**🎯 Ready to analyze reviews on any e-commerce site? Install the extension and start getting instant, unbiased product insights!**
