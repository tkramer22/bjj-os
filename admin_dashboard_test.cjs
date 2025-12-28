#!/usr/bin/env node

/**
 * BJJ OS Admin Dashboard Comprehensive Test Script
 * Tests all admin endpoints and database integrity
 */

const https = require('https');
const http = require('http');

// Configuration
const BASE_URL = 'http://localhost:5000';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// Global JWT token for admin requests
let adminToken = null;

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

// Helper to login and get JWT token
async function adminLogin() {
  const url = `${BASE_URL}/api/admin/login`;
  
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const urlObj = new URL(url);
    const postData = JSON.stringify({ password: ADMIN_PASSWORD });
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = protocol.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300 && json.token) {
            adminToken = json.token;
            resolve({ success: true, token: json.token });
          } else {
            resolve({ success: false, error: json });
          }
        } catch (e) {
          resolve({ success: false, error: data });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

// Helper to make admin API requests
async function adminRequest(endpoint) {
  const url = `${BASE_URL}${endpoint}`;
  
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const urlObj = new URL(url);
    
    const headers = {
      'Content-Type': 'application/json',
    };
    
    // Add JWT token if available
    if (adminToken) {
      headers['Authorization'] = `Bearer ${adminToken}`;
    }
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers,
    };

    const req = protocol.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, data: json, status: res.statusCode });
          } else {
            resolve({ success: false, error: json, status: res.statusCode });
          }
        } catch (e) {
          resolve({ success: false, error: data, status: res.statusCode });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

// Test results tracker
const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
  tests: [],
};

function logTest(name, passed, message, data = null) {
  const icon = passed ? '✓' : '✗';
  const color = passed ? colors.green : colors.red;
  
  console.log(`${color}${icon} ${name}${colors.reset}`);
  if (message) {
    console.log(`  ${message}`);
  }
  if (data) {
    console.log(`  ${colors.cyan}${JSON.stringify(data, null, 2)}${colors.reset}`);
  }
  
  results.tests.push({ name, passed, message, data });
  if (passed) {
    results.passed++;
  } else {
    results.failed++;
  }
}

function logWarning(message) {
  console.log(`${colors.yellow}⚠ WARNING: ${message}${colors.reset}`);
  results.warnings++;
}

function logSection(title) {
  console.log(`\n${colors.bright}${colors.blue}━━━ ${title} ━━━${colors.reset}\n`);
}

function logInfo(message) {
  console.log(`${colors.cyan}ℹ ${message}${colors.reset}`);
}

// Main test runner
async function runTests() {
  console.log(`${colors.bright}${colors.magenta}`);
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║   BJJ OS ADMIN DASHBOARD COMPREHENSIVE TEST SUITE         ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log(colors.reset);
  
  logInfo(`Testing endpoint: ${BASE_URL}`);
  logInfo(`Admin password configured: ${ADMIN_PASSWORD ? 'Yes' : 'No'}`);
  
  if (!ADMIN_PASSWORD) {
    console.log(`${colors.red}ERROR: ADMIN_PASSWORD not set!${colors.reset}`);
    process.exit(1);
  }

  // Login to get JWT token
  logSection('0. ADMIN AUTHENTICATION');
  try {
    const loginResult = await adminLogin();
    if (loginResult.success) {
      logTest('Admin login', true, 'Successfully authenticated and received JWT token');
    } else {
      logTest('Admin login', false, `Failed: ${JSON.stringify(loginResult.error)}`);
      console.log(`${colors.red}Cannot continue without authentication${colors.reset}`);
      process.exit(1);
    }
  } catch (error) {
    logTest('Admin login', false, `Error: ${error.message}`);
    process.exit(1);
  }

  try {
    // Test 1: Video Library Stats
    logSection('1. VIDEO LIBRARY STATISTICS');
    try {
      const videoStats = await adminRequest('/api/admin/videos/stats');
      if (videoStats.success && videoStats.data.stats) {
        const stats = videoStats.data.stats;
        logTest('Video stats endpoint', true, 'Successfully retrieved video statistics');
        
        console.log(`  ${colors.bright}Total Videos:${colors.reset} ${stats.total_videos || 0}`);
        console.log(`  ${colors.bright}Average Quality:${colors.reset} ${stats.avg_quality || 0}`);
        console.log(`  ${colors.bright}Added Today:${colors.reset} ${stats.added_today || 0}`);
        console.log(`  ${colors.bright}Helpful Rate:${colors.reset} ${stats.helpful_rate || 0}%`);
        
        if (parseInt(stats.total_videos) === 0) {
          logWarning('No videos in library - curation may not have run yet');
        }
        
        if (parseInt(stats.added_today) === 0) {
          logWarning('No videos added today - check curation schedule');
        }
      } else {
        logTest('Video stats endpoint', false, `Failed: ${JSON.stringify(videoStats.error)}`);
      }
    } catch (error) {
      logTest('Video stats endpoint', false, `Error: ${error.message}`);
    }

    // Test 2: Instructor Stats
    logSection('2. INSTRUCTOR STATISTICS');
    try {
      const instructorStats = await adminRequest('/api/admin/instructors/stats');
      if (instructorStats.success) {
        const stats = instructorStats.data;
        logTest('Instructor stats endpoint', true, 'Successfully retrieved instructor stats');
        
        console.log(`  ${colors.bright}Total Instructors:${colors.reset} ${stats.total || 0}`);
        console.log(`  ${colors.bright}Needs Review:${colors.reset} ${stats.needsReview || 0}`);
        console.log(`  ${colors.bright}Auto-Discovered:${colors.reset} ${stats.autoDiscovered || 0}`);
        console.log(`  ${colors.bright}Featured:${colors.reset} ${stats.featured || 0}`);
        
        if (stats.total === 0) {
          logWarning('No instructors in database - discovery may not have run');
        }
      } else {
        logTest('Instructor stats endpoint', false, `Failed: ${JSON.stringify(instructorStats.error)}`);
      }
    } catch (error) {
      logTest('Instructor stats endpoint', false, `Error: ${error.message}`);
    }

    // Test 3: Feedback Stats
    logSection('3. USER FEEDBACK STATISTICS');
    try {
      const feedbackStats = await adminRequest('/api/admin/feedback/stats');
      if (feedbackStats.success) {
        const stats = feedbackStats.data;
        logTest('Feedback stats endpoint', true, 'Successfully retrieved feedback stats');
        
        console.log(`  ${colors.bright}Total Feedback:${colors.reset} ${stats.totalFeedback || 0}`);
        console.log(`  ${colors.bright}Avg Helpful Ratio:${colors.reset} ${stats.avgHelpfulRatio || 0}%`);
        console.log(`  ${colors.bright}Videos Removed:${colors.reset} ${stats.videosRemoved || 0}`);
        console.log(`  ${colors.bright}Top-Tier Videos:${colors.reset} ${stats.topTierVideos || 0}`);
      } else {
        logTest('Feedback stats endpoint', false, `Failed: ${JSON.stringify(feedbackStats.error)}`);
      }
    } catch (error) {
      logTest('Feedback stats endpoint', false, `Error: ${error.message}`);
    }

    // Test 4: AI Metrics
    logSection('4. AI CURATION METRICS');
    try {
      const aiMetrics = await adminRequest('/api/admin/ai-metrics');
      if (aiMetrics.success) {
        const metrics = aiMetrics.data[0] || {};
        logTest('AI metrics endpoint', true, 'Successfully retrieved AI metrics');
        
        if (metrics.date) {
          console.log(`  ${colors.bright}Latest Date:${colors.reset} ${metrics.date}`);
          console.log(`  ${colors.bright}Users Sent:${colors.reset} ${metrics.totalUsersSent || 0}`);
          console.log(`  ${colors.bright}Avg Quality:${colors.reset} ${metrics.avgQualityScore || 0}`);
          console.log(`  ${colors.bright}Click Rate:${colors.reset} ${metrics.clickRate || 0}%`);
          console.log(`  ${colors.bright}Skip Rate:${colors.reset} ${metrics.skipRate || 0}%`);
        } else {
          logWarning('No AI metrics recorded yet');
        }
      } else {
        logTest('AI metrics endpoint', false, `Failed: ${JSON.stringify(aiMetrics.error)}`);
      }
    } catch (error) {
      logTest('AI metrics endpoint', false, `Error: ${error.message}`);
    }

    // Test 5: Instructor Performance
    logSection('5. INSTRUCTOR PERFORMANCE');
    try {
      const instructorPerf = await adminRequest('/api/admin/instructor-performance');
      if (instructorPerf.success && Array.isArray(instructorPerf.data)) {
        logTest('Instructor performance endpoint', true, 
          `Retrieved ${instructorPerf.data.length} instructor performance records`);
        
        // Show top 5 instructors
        const top5 = instructorPerf.data.slice(0, 5);
        if (top5.length > 0) {
          console.log(`\n  ${colors.bright}Top 5 Instructors by Videos Sent:${colors.reset}`);
          top5.forEach((inst, idx) => {
            console.log(`  ${idx + 1}. ${inst.instructorName}: ${inst.totalVideosSent} videos (${inst.clickRate}% click rate)`);
          });
        }
      } else {
        logTest('Instructor performance endpoint', false, `Failed or no data`);
      }
    } catch (error) {
      logTest('Instructor performance endpoint', false, `Error: ${error.message}`);
    }

    // Test 6: Auto-Curation Stats
    logSection('6. AUTO-CURATION STATISTICS');
    try {
      const curationStats = await adminRequest('/api/admin/auto-curation/stats');
      if (curationStats.success && curationStats.data) {
        const stats = curationStats.data;
        logTest('Curation stats endpoint', true, 'Successfully retrieved curation stats');
        
        console.log(`  ${colors.bright}Total Runs:${colors.reset} ${stats.totalRuns || 0}`);
        console.log(`  ${colors.bright}Total Analyzed:${colors.reset} ${stats.totalAnalyzed || 0}`);
        console.log(`  ${colors.bright}Total Added:${colors.reset} ${stats.totalAdded || 0}`);
        console.log(`  ${colors.bright}Total Rejected:${colors.reset} ${stats.totalRejected || 0}`);
        console.log(`  ${colors.bright}Avg Quality:${colors.reset} ${stats.avgQuality || 0}`);
        console.log(`  ${colors.bright}Approval Rate:${colors.reset} ${stats.approvalRate || 0}%`);
        
        if (stats.lastRunAt) {
          console.log(`  ${colors.bright}Last Run:${colors.reset} ${stats.lastRunAt}`);
        }
        if (stats.nextRunAt) {
          console.log(`  ${colors.bright}Next Run:${colors.reset} ${stats.nextRunAt}`);
        }
      } else {
        logTest('Curation stats endpoint', false, `Failed: ${JSON.stringify(curationStats.error)}`);
      }
    } catch (error) {
      logTest('Curation stats endpoint', false, `Error: ${error.message}`);
    }

    // Test 7: Curation History (Last 7 Days)
    logSection('7. CURATION HISTORY (7-DAY ACTIVITY)');
    try {
      const curationHistory = await adminRequest('/api/admin/curation/history');
      if (curationHistory.success && Array.isArray(curationHistory.data)) {
        logTest('Curation history endpoint', true, 
          `Retrieved ${curationHistory.data.length} historical curation runs`);
        
        const last7Days = curationHistory.data.slice(0, 7);
        if (last7Days.length > 0) {
          console.log(`\n  ${colors.bright}Last 7 Curation Runs:${colors.reset}`);
          last7Days.forEach((run, idx) => {
            const date = new Date(run.startedAt).toLocaleDateString();
            console.log(`  ${idx + 1}. ${date}: ${run.videosAdded} added, ${run.videosRejected} rejected (${run.avgQuality} avg quality)`);
          });
        } else {
          logWarning('No curation history found - curation may not have run yet');
        }
      } else {
        logTest('Curation history endpoint', false, `Failed or no data`);
      }
    } catch (error) {
      logTest('Curation history endpoint', false, `Error: ${error.message}`);
    }

    // Test 8: Technique Coverage
    logSection('8. TECHNIQUE COVERAGE');
    try {
      const techniqueStats = await adminRequest('/api/admin/techniques/stats');
      if (techniqueStats.success && techniqueStats.data) {
        const stats = techniqueStats.data;
        logTest('Technique stats endpoint', true, 'Successfully retrieved technique stats');
        
        console.log(`  ${colors.bright}Total Techniques:${colors.reset} ${stats.totalTechniques || 0}`);
        console.log(`  ${colors.bright}Techniques with Videos:${colors.reset} ${stats.techniquesWithVideos || 0}`);
        console.log(`  ${colors.bright}Coverage Rate:${colors.reset} ${stats.coverageRate || 0}%`);
        
        if (stats.topTechniques && stats.topTechniques.length > 0) {
          console.log(`\n  ${colors.bright}Top 10 Techniques by Video Count:${colors.reset}`);
          stats.topTechniques.slice(0, 10).forEach((tech, idx) => {
            console.log(`  ${idx + 1}. ${tech.name}: ${tech.videoCount} videos`);
          });
        }
      } else {
        logTest('Technique stats endpoint', false, `Failed: ${JSON.stringify(techniqueStats.error)}`);
      }
    } catch (error) {
      logTest('Technique stats endpoint', false, `Error: ${error.message}`);
    }

  } catch (error) {
    console.error(`${colors.red}Fatal error during tests: ${error.message}${colors.reset}`);
    process.exit(1);
  }

  // Final Summary
  logSection('TEST SUMMARY');
  
  const totalTests = results.passed + results.failed;
  const passRate = totalTests > 0 ? ((results.passed / totalTests) * 100).toFixed(1) : 0;
  
  console.log(`${colors.bright}Total Tests:${colors.reset} ${totalTests}`);
  console.log(`${colors.green}Passed:${colors.reset} ${results.passed}`);
  console.log(`${colors.red}Failed:${colors.reset} ${results.failed}`);
  console.log(`${colors.yellow}Warnings:${colors.reset} ${results.warnings}`);
  console.log(`${colors.bright}Pass Rate:${colors.reset} ${passRate}%`);
  
  if (results.failed === 0 && results.warnings === 0) {
    console.log(`\n${colors.green}${colors.bright}✓ All tests passed! Admin dashboard is fully operational.${colors.reset}`);
    process.exit(0);
  } else if (results.failed === 0) {
    console.log(`\n${colors.yellow}${colors.bright}⚠ All tests passed but with warnings. Review above.${colors.reset}`);
    process.exit(0);
  } else {
    console.log(`\n${colors.red}${colors.bright}✗ Some tests failed. Review errors above.${colors.reset}`);
    process.exit(1);
  }
}

// Run the tests
runTests().catch((error) => {
  console.error(`${colors.red}Unhandled error: ${error.message}${colors.reset}`);
  process.exit(1);
});
