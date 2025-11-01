Create Task
Create a new generation task


Request Body Structure
{
  "model": "string",
  "callBackUrl": "string (optional)",
  "input": {
    // Input parameters based on form configuration
  }
}
Example : 
curl -X POST "https://api.kie.ai/api/v1/jobs/createTask" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "google/nano-banana-edit",
    "callBackUrl": "https://your-domain.com/api/callback",
    "input": {
      "prompt": "turn this photo into a character figure. Behind it, place a box with the character’s image printed on it, and a computer showing the Blender modeling process on its screen. In front of the box, add a round plastic base with the character figure standing on it. set the scene indoors if possible",
      "image_urls": [
        "https://file.aiquickdraw.com/custom-page/akr/section-images/1756223420389w8xa2jfe.png"
      ],
      "output_format": "png",
      "image_size": "1:1"
    }
}'

Params : 
model - Required
callBackUrl - Optional
Input Object Parameters
input.prompt - Required - string - Max length: 5000 characters
input.output_format - Optional - string - OUTPUT : png jpeg
input.image_size - Optional - Available options:

1:1
-
9:16
-
16:9
-
3:4
-
4:3
-
3:2
-
2:3
-
5:4
-
4:5
-
21:9
-
auto
--------------
Response Example: 
{
  "code": 200,
  "message": "success",
  "data": {
    "taskId": "task_12345678"
  }
}
--------------
Callback Notifications
When you provide the callBackUrl parameter when creating a task, the system will send POST requests to the specified URL upon task completion (success or failure).

Success Callback Example
{
    "code": 200,
    "data": {
        "completeTime": 1755599644000,
        "consumeCredits": 100,
        "costTime": 8,
        "createTime": 1755599634000,
        "model": "google/nano-banana",
        "param": "{\"callBackUrl\":\"https://your-domain.com/api/callback\",\"model\":\"google/nano-banana\",\"input\":{\"prompt\":\"A surreal painting of a giant banana floating in space, stars and galaxies in the background, vibrant colors, digital art\",\"output_format\":\"png\",\"image_size\":\"1:1\"}}",
        "remainedCredits": 2510330,
        "resultJson": "{\"resultUrls\":[\"https://example.com/generated-image.jpg\"]}",
        "state": "success",
        "taskId": "e989621f54392584b05867f87b160672",
        "updateTime": 1755599644000
    },
    "msg": "Playground task completed successfully."
}

Failure Callback Example
{
    "code": 501,
    "data": {
        "completeTime": 1755597081000,
        "consumeCredits": 0,
        "costTime": 0,
        "createTime": 1755596341000,
        "failCode": "500",
        "failMsg": "Internal server error",
        "model": "google/nano-banana",
        "param": "{\"callBackUrl\":\"https://your-domain.com/api/callback\",\"model\":\"google/nano-banana\",\"input\":{\"prompt\":\"A surreal painting of a giant banana floating in space, stars and galaxies in the background, vibrant colors, digital art\",\"output_format\":\"png\",\"image_size\":\"1:1\"}}",
        "remainedCredits": 2510430,
        "state": "fail",
        "taskId": "bd3a37c523149e4adf45a3ddb5faf1a8",
        "updateTime": 1755597097000
    },
    "msg": "Playground task failed."
}

-------------------------------------------
Query Task
Query task status and results by task ID




Request Example
curl -X GET "https://api.kie.ai/api/v1/jobs/recordInfo?taskId=task_12345678" \
  -H "Authorization: Bearer YOUR_API_KEY"

Response Example
{
  "code": 200,
  "message": "success",
  "data": {
    "taskId": "task_12345678",
    "model": "google/nano-banana",
    "state": "success",
    "param": "{\"model\":\"google/nano-banana\",\"callBackUrl\":\"https://your-domain.com/api/callback\",\"input\":{\"prompt\":\"A surreal painting of a giant banana floating in space, stars and galaxies in the background, vibrant colors, digital art\",\"output_format\":\"png\",\"image_size\":\"1:1\"}}",
    "resultJson": "{\"resultUrls\":[\"https://example.com/generated-image.jpg\"]}",
    "failCode": "",
    "failMsg": "",
    "completeTime": 1698765432000,
    "createTime": 1698765400000,
    "updateTime": 1698765432000
  }
}