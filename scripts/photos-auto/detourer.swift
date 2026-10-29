// Détoure le produit d'une photo (Vision d'Apple, « sujet au premier plan ») et l'écrit en PNG transparent.
//   detourer <entrée.jpg> <sortie.png>
// Code de sortie 2 : aucun sujet trouvé.
import Foundation
import Vision
import CoreImage
import CoreImage.CIFilterBuiltins
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count == 3 else { FileHandle.standardError.write("usage: detourer in out\n".data(using: .utf8)!); exit(1) }
let input = URL(fileURLWithPath: args[1]), output = URL(fileURLWithPath: args[2])
guard let image = CIImage(contentsOf: input) else { exit(1) }
let request = VNGenerateForegroundInstanceMaskRequest()
let handler = VNImageRequestHandler(ciImage: image)
do { try handler.perform([request]) } catch { exit(1) }
guard let result = request.results?.first, !result.allInstances.isEmpty else { exit(2) }
guard let buffer = try? result.generateMaskedImage(ofInstances: result.allInstances, from: handler, croppedToInstancesExtent: true) else { exit(1) }
let masked = CIImage(cvPixelBuffer: buffer)
let context = CIContext()
guard let cg = context.createCGImage(masked, from: masked.extent),
      let dest = CGImageDestinationCreateWithURL(output as CFURL, UTType.png.identifier as CFString, 1, nil) else { exit(1) }
CGImageDestinationAddImage(dest, cg, nil)
exit(CGImageDestinationFinalize(dest) ? 0 : 1)
