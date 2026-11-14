import { Config } from "@remotion/cli/config";

// Frames are rendered as high-quality JPEG (much faster than PNG; the grain layer hides banding).
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(96);
Config.setOverwriteOutput(true);
Config.setConcurrency(3);
Config.setCodec("h264");
Config.setCrf(16);
Config.setPixelFormat("yuv420p");
Config.setAudioCodec("aac");
Config.setAudioBitrate("192k");
// Frames are sRGB from the browser; tag and convert them as BT.709 (the HD standard) so players show the colours as designed.
Config.setColorSpace("bt709");
