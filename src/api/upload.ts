import { RouteInfo, UploadFile, UploadFileMetadata } from "~/types"
import { uploadFilesToUrls } from "./athena"
import { getFiles, requestToUploadFiles } from "./file"
import { parseRouteName } from "./route";

const fileTypes = { rlog: ["rlog.bz2", "rlog.zst"], fcamera: ["fcamera.hevc"], dcamera: ["dcamera.hevc"], ecamera: ["ecamera.hevc"] };

const getUploadedFiles = async (routeName: string) => {
  const files = await getFiles(routeName);
  return [...files.cameras, ...files.dcameras, ...files.ecameras, ...files.logs, ...files.qcameras, ...files.qlogs];
};

const generateMissingFilePaths = (routeInfo: RouteInfo, segmentStart: number, segmentEnd: number, uploadedFiles: string[]): string[] => {
  const paths: string[] = [];
  
  for (let i = segmentStart; i <= segmentEnd; i++) {
    for (const fileNames of Object.values(fileTypes)) {
      for (const fileName of fileNames) {
        const key = [routeInfo.dongleId, routeInfo.routeId, i, fileName].join('/');
        if (!uploadedFiles.find((path) => path.includes(key))) {
          paths.push(`${routeInfo.routeId}--${i}/${fileName}`);
        }
      }
    }
  }
  
  return paths;
};

const prepareUploadRequests = (paths: string[], presignedUrls: UploadFileMetadata[]): UploadFile[] => {
  return paths.map((path, i) => ({ filePath: path, ...presignedUrls[i] }));
};

export const uploadAllSegments = (routeName: string, totalSegments: number) => uploadSegments(routeName, 0, totalSegments - 1);
export const uploadSegments = async (routeName: string, segmentStart: number, segmentEnd: number) => {
  const routeInfo = parseRouteName(routeName);
  const uploadedFiles = await getUploadedFiles(routeName);
  const paths = generateMissingFilePaths(routeInfo, segmentStart, segmentEnd, uploadedFiles);
  const pathPresignedUrls = await requestToUploadFiles(routeInfo.dongleId, paths);
  const athenaRequests = prepareUploadRequests(paths, pathPresignedUrls);
  return await uploadFilesToUrls(routeInfo.dongleId, athenaRequests);
}