#!/usr/bin/env python3
import sys
import logging
from flask import Flask, request, jsonify
from flask_cors import CORS
from phonetic_engine import analyze

app = Flask(__name__)
# Enable CORS so the React frontend can talk to us locally
CORS(app)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("ph-server")

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok"}), 200

@app.route('/analyze', methods=['POST'])
def run_analysis():
    data = request.json
    if not data or 'text' not in data:
        return jsonify({"error": "Missing 'text' in request body"}), 400
    
    text = data['text']
    sections = data.get('sections') # optional list of labels
    
    try:
        logger.info(f"Analyzing text ({len(text)} chars)...")
        result = analyze(text, section_labels=sections)
        logger.info("Analysis complete.")
        return jsonify(result), 200
    except Exception as e:
        logger.error(f"Analysis failed: {str(e)}")
        return jsonify({"error": str(e)}), 500

def start_server(port=7744):
    logger.info(f"Starting Lyrical Phonetics backend on port {port}...")
    app.run(host='127.0.0.1', port=port, debug=False)

if __name__ == "__main__":
    port = 7744
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass
    start_server(port)
