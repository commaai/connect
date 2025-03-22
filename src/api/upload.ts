import { RouteInfo, UploadFile, UploadFileMetadata } from '~/types'
import { uploadFilesToUrls } from './athena'
import { getAlreadyUploadedFiles, requestToUploadFiles } from './file'
import { parseRouteName } from './route'

const FILE_TYPES = {
  logs: ['rlog.bz2', 'rlog.zst'],
  cameras: ['fcamera.hevc'],
  dcameras: ['dcamera.hevc'],
  ecameras: ['ecamera.hevc'],
}

const getFiles = async (routeName: string, type?: keyof typeof FILE_TYPES) => {
  const files = await getAlreadyUploadedFiles(routeName)
  if (type) return [...files[type]]
  return [...files.cameras, ...files.dcameras, ...files.ecameras, ...files.logs]
}

const generateMissingFilePaths = (routeInfo: RouteInfo, segmentStart: number, segmentEnd: number, uploadedFiles: string[]): string[] => {
  const paths: string[] = []
  for (let i = segmentStart; i <= segmentEnd; i++) {
    for (const fileName of Object.values(FILE_TYPES).flat()) {
      const key = [routeInfo.dongleId, routeInfo.routeId, i, fileName].join('/')
      if (!uploadedFiles.find((path) => path.includes(key))) {
        paths.push(`${routeInfo.routeId}--${i}/${fileName}`)
      }
    }
  }
  return paths
}

const prepareUploadRequests = (paths: string[], presignedUrls: UploadFileMetadata[]): UploadFile[] =>
  paths.map((path, i) => ({ filePath: path, ...presignedUrls[i] }))

export const uploadAllSegments = (routeName: string, totalSegments: number, type?: keyof typeof FILE_TYPES) =>
  uploadSegments(routeName, 0, totalSegments - 1, type)

export const uploadSegments = async (routeName: string, segmentStart: number, segmentEnd: number, type?: keyof typeof FILE_TYPES) => {
  const routeInfo = parseRouteName(routeName)
  const alreadyUploadedFiles = await getFiles(routeName, type)
  const paths = generateMissingFilePaths(routeInfo, segmentStart, segmentEnd, alreadyUploadedFiles)
  const pathPresignedUrls = await requestToUploadFiles(routeInfo.dongleId, paths)
  const athenaRequests = prepareUploadRequests(paths, pathPresignedUrls)
  return await uploadFilesToUrls(routeInfo.dongleId, athenaRequests)
}
