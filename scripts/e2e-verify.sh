#!/bin/bash
# ApplyPilot end-to-end API verification
BASE="http://localhost:3000"
JAR="/home/z/my-project/scripts/e2e-cookies.txt"
rm -f "$JAR"
PASS=0; FAIL=0

check() {
  local name="$1" expected="$2" actual="$3"
  if echo "$actual" | grep -q "$expected"; then
    PASS=$((PASS+1)); echo "PASS: $name"
  else
    FAIL=$((FAIL+1)); echo "FAIL: $name — expected '$expected' in: ${actual:0:300}"
  fi
}

echo "=== 1. Health ==="
R=$(curl -s -m 30 "$BASE/api/health")
check "health db=mongodb" '"db":"mongodb"' "$R"

echo "=== 2. Profile PUT ==="
R=$(curl -s -m 30 -b "$JAR" -c "$JAR" -X PUT "$BASE/api/profile" \
  -H "Content-Type: application/json" \
  -d '{"fullName":"Jane Tester","email":"jane@test.dev","phone":"+1 415 555 0134","location":"San Francisco, CA","summary":"Senior frontend engineer.","skills":["React","TypeScript"],"experience":[{"company":"Acme","title":"Senior FE Engineer","location":"SF","startDate":"Jan 2020","endDate":"","current":true,"description":"Built design systems."}],"education":[{"degree":"B.S.","school":"UC Berkeley","field":"CS","startYear":"2012","endYear":"2016","gpa":"3.8"}]}')
check "profile save" '"ok":true' "$R"

echo "=== 3. Profile GET ==="
R=$(curl -s -m 30 -b "$JAR" -c "$JAR" "$BASE/api/profile")
check "profile returns name" 'Jane Tester' "$R"

echo "=== 4. Resume parse (text upload) ==="
printf 'JANE TESTER\nSenior Frontend Engineer\nEmail: jane@test.dev | Phone: +1 415 555 0134 | San Francisco, CA\nLinkedIn: linkedin.com/in/janetester | GitHub: github.com/janetester\n\nSUMMARY\nFrontend engineer with 8 years of experience building design systems and web apps.\n\nEXPERIENCE\nAcme Corp — Senior Frontend Engineer, San Francisco (Jan 2020 - Present)\n- Built and maintained a design system used by 40 engineers.\n\nGlobex — Frontend Engineer (Jun 2016 - Dec 2019)\n- Shipped customer dashboard in React.\n\nEDUCATION\nB.S. Computer Science, UC Berkeley, 2012-2016, GPA 3.8\n\nSKILLS: React, TypeScript, GraphQL, Tailwind CSS\nCERTIFICATIONS: AWS Certified Developer\nLANGUAGES: English, Spanish\n' > /tmp/sample-resume.txt
R=$(curl -s -m 120 -b "$JAR" -c "$JAR" -X POST "$BASE/api/resume/parse" -F "file=@/tmp/sample-resume.txt")
check "resume parse ok" '"ok":true' "$R"

echo "=== 5. API key create ==="
R=$(curl -s -m 30 -b "$JAR" -c "$JAR" -X POST "$BASE/api/keys" -H "Content-Type: application/json" -d '{"label":"Test laptop"}')
check "key created" 'ap_live_' "$R"
APIKEY=$(echo "$R" | grep -o 'ap_live_[a-f0-9]*' | head -1)
echo "  key = ${APIKEY:0:16}..."

echo "=== 6. Extension handshake ==="
R=$(curl -s -m 30 -X POST "$BASE/api/ext/handshake" -H "Authorization: Bearer $APIKEY" -H "Content-Type: application/json" -d '{"version":"1.0.0"}')
check "handshake profile" 'jane@test.dev' "$R"
check "handshake aiProvider" 'aiProvider' "$R"

echo "=== 7. Extension autofill (AI mapping) ==="
R=$(curl -s -m 120 -X POST "$BASE/api/ext/autofill" -H "Authorization: Bearer $APIKEY" -H "Content-Type: application/json" \
  -d '{"platform":"greenhouse","url":"https://boards.greenhouse.io/acme/jobs/123","jobDescription":"We are hiring a senior frontend engineer strong in React.","fields":[{"fieldId":"first_name","type":"text","label":"First Name","required":true},{"fieldId":"last_name","type":"text","label":"Last Name","required":true},{"fieldId":"email","type":"email","label":"Email","required":true},{"fieldId":"phone","type":"tel","label":"Phone","required":false},{"fieldId":"linkedin","type":"url","label":"LinkedIn Profile","required":false},{"fieldId":"why_us","type":"textarea","label":"Why do you want to work here?","required":true,"maxLength":400}]}')
check "autofill ok" '"ok":true' "$R"
check "autofill fills email" 'jane@test.dev' "$R"

echo "=== 8. Extension report (errors detected) ==="
R=$(curl -s -m 30 -X POST "$BASE/api/ext/report" -H "Authorization: Bearer $APIKEY" -H "Content-Type: application/json" \
  -d '{"platform":"greenhouse","url":"https://boards.greenhouse.io/acme/jobs/123","fieldsFilled":6,"errorsDetected":[{"fieldId":"phone","error":"Invalid phone format","value":"555-0134x"}],"repaired":[{"fieldId":"phone","before":"555-0134x","after":"+1 415 555 0134"}],"status":"completed_with_repairs"}')
check "report ok" '"ok":true' "$R"

echo "=== 9. Stats ==="
R=$(curl -s -m 30 -b "$JAR" -c "$JAR" "$BASE/api/stats")
check "stats sessions" 'sessions' "$R"

echo "=== 10. Extension repair ==="
R=$(curl -s -m 60 -X POST "$BASE/api/ext/repair" -H "Authorization: Bearer $APIKEY" -H "Content-Type: application/json" \
  -d '{"field":{"fieldId":"phone","type":"tel","label":"Phone"},"error":"Invalid phone number format","value":"not-a-phone"}')
check "repair ok" '"ok"' "$R"

echo ""
echo "=============================="
echo "RESULTS: $PASS passed, $FAIL failed"
