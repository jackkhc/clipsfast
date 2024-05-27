import { NextRequest, NextResponse } from "next/server"
import { v4 as uuidv4 } from 'uuid'

export async function POST(req: NextRequest) {
    try {
        const ffmpeg = require('fluent-ffmpeg');

        //const { videoURL } = req.body as any
        const videoURL = "https://s3-ap-southeast-2.amazonaws.com/shotstack-assets/footage/skater.hd.mp4"
        const videoExtensionRegex = /\.(?<extension>[^.\/?#]+)(?:\?|$)/ 
        const videoExtension = videoURL.match(videoExtensionRegex)?.groups?.extension ?? "mp4"
        
        const assemblyaiRouteResponse = await fetch("http://localhost:3000/api/processvideo/assemblyai", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(
                {
                    audioURL:videoURL
                }
            )
        })
        if (!assemblyaiRouteResponse.ok) {
            throw new Error("Error with AssemblyAI api response");
        }
        const transcriptTextWithEmeddedTimeStamps = await assemblyaiRouteResponse.json()
        if (transcriptTextWithEmeddedTimeStamps.error) {
            throw new Error(transcriptTextWithEmeddedTimeStamps.error)
        }

        const chatgpRouteResponse = await fetch("http://localhost:3000/api/processvideo/chatgpt/", {
            method: "POST", 
            headers:{
                "Content-Type": "application/json"
            },
            body: JSON.stringify(
                {
                    transcriptTextWithEmeddedTimeStamps: transcriptTextWithEmeddedTimeStamps
                }
            )
        })
        if (!chatgpRouteResponse.ok) {
            throw new Error("Error with ChatGPT api response");
        }
        const highlightedTimestamps = await chatgpRouteResponse.json()
        if (highlightedTimestamps.error) {
            throw new Error(highlightedTimestamps.error)
        }
        console.log({"highlightedTimestamps": highlightedTimestamps})


        const outputFilePaths = []

        for (const highlightedTimestamp of highlightedTimestamps) {
            const { start, end } = highlightedTimestamp

            const processedVideoName = uuidv4() + "." + videoExtension
            const relativeOutputFilePath = "./src/app/videos/"
            const outputFilePath = relativeOutputFilePath + processedVideoName
    
            await new Promise<void>((resolve, reject) => {
                ffmpeg(videoURL)
                    .output(outputFilePath)
                    .videoCodec("libx264")
                    .setStartTime(start)
                    .duration(end - start)
                    .size("1080x1920")
                    .autopad()
                    .on("error", (error: any) => {
                        console.error(`Error processing video: ${processedVideoName}`, error);
                        reject(error);
                    })
                    .on("progress", (progress: any) => {
                        console.log(`Processing frames for ${processedVideoName}: ${progress.frames}`);
                    })
                    .on("end", () => {
                        console.log(`Finished processing: ${processedVideoName}`);
                        resolve();
                    })
                    .run();
            })

            outputFilePaths.push(outputFilePath)
        }

        return NextResponse.json(highlightedTimestamps)
    } catch (error) {
        console.error(error)
        return NextResponse.json({ error: "Failed to fetch processed video" })
    }
}