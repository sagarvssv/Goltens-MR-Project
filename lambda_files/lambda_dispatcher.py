"""
AgentCore Lambda Dispatcher
Single Lambda that routes all AgentCore tool calls to the right handler
"""
import json
import importlib
import sys
import os

# Map of action names to handler modules
ACTION_MAP = {
    "submit_mr":          "functions.submit_mr.handler",
    "list_mrs":           "functions.list_mrs.handler",
    "get_user_profile":   "functions.get_user_profile.handler",
    "reserve_mr_id":      "functions.reserve_mr_id.handler",
    "approve_mr":         "functions.approve_mr.handler",
    "reject_mr":          "functions.reject_mr.handler",
    "hod_approve_mr":     "functions.hod_approve_mr.handler",
    "sc_receive_mr":      "functions.sc_receive_mr.handler",
    "mark_inprocess_mr":  "functions.mark_inprocess_mr.handler",
    "warehouse_issue_mr": "functions.warehouse_issue_mr.handler",
    "get_upload_url":     "functions.get_upload_url.handler",
    "get_document_urls":  "functions.get_document_urls.handler",
    "reassign_mr":        "functions.reassign_mr.handler",
    "resubmit_mr":        "functions.resubmit_mr.handler",
}

def handler(event, context):
    print(f"AgentCore event: {json.dumps(event)}")

    # AgentCore passes action in event
    action_group = event.get("actionGroup", "")
    api_path     = event.get("apiPath", "").strip("/")
    http_method  = event.get("httpMethod", "POST")
    
    # Extract parameters from AgentCore event format
    request_body = event.get("requestBody", {})
    content      = request_body.get("content", {})
    props        = content.get("application/json", {}).get("properties", [])
    
    # Build body dict from AgentCore properties
    body = {}
    for prop in props:
        body[prop["name"]] = prop["value"]

    # Build a standard Lambda event
    lambda_event = {
        "body": json.dumps(body),
        "headers": event.get("headers", {}),
    }

    # Find and call the right handler
    action = api_path  # e.g. "submit_mr"
    
    if action not in ACTION_MAP:
        return {
            "messageVersion": "1.0",
            "response": {
                "actionGroup": action_group,
                "apiPath": api_path,
                "httpMethod": http_method,
                "httpStatusCode": 400,
                "responseBody": {
                    "application/json": {
                        "body": json.dumps({"error": f"Unknown action: {action}"})
                    }
                }
            }
        }

    module_path = ACTION_MAP[action]
    module      = importlib.import_module(module_path)
    result      = module.handler(lambda_event, context)

    # Format response for AgentCore
    return {
        "messageVersion": "1.0",
        "response": {
            "actionGroup": action_group,
            "apiPath": api_path,
            "httpMethod": http_method,
            "httpStatusCode": result.get("statusCode", 200),
            "responseBody": {
                "application/json": {
                    "body": result.get("body", "{}")
                }
            }
        }
    }
