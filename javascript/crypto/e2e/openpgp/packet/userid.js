// Copyright 2013 Google Inc. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//   http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
/**
 * @fileoverview User ID packet.
 */

goog.provide('e2e.openpgp.packet.UserId');

goog.require('e2e');
/** @suppress {extraRequire} intentional import */
goog.require('e2e.compression.all');
goog.require('e2e.compression.factory');
goog.require('e2e.hash.Algorithm');
/** @suppress {extraRequire} intentional import */
goog.require('e2e.hash.all');
goog.require('e2e.openpgp.constants');
goog.require('e2e.openpgp.error.SerializationError');
goog.require('e2e.openpgp.packet.Packet');
goog.require('e2e.openpgp.packet.Signature');
goog.require('e2e.openpgp.packet.factory');
goog.require('goog.array');



/**
 * User ID Packet (Tag 13) defined in RFC 4880 section 5.11.
 * @param {string} userId The user ID.
 * @constructor
 * @extends {e2e.openpgp.packet.Packet}
 */
e2e.openpgp.packet.UserId = function(userId) {
  goog.base(this);
  /**
   * UTF-8 text representing the name and email address of the key holder.
   * @type {string}
   */
  this.userId = userId;
  /**
   * @type {Array.<e2e.openpgp.packet.Signature>}
   * @private
   */
  this.certifications_ = [];
};
goog.inherits(e2e.openpgp.packet.UserId,
              e2e.openpgp.packet.Packet);


/** @inheritDoc */
e2e.openpgp.packet.UserId.prototype.tag = 13;


/**
 * Parses and extracts the data from the body. It will consume all data from the
 * array.
 * @param {!e2e.ByteArray} body The data to parse.
 * @return {e2e.openpgp.packet.UserId} A user ID Packet.
 */
e2e.openpgp.packet.UserId.parse = function(body) {
  var userId = e2e.byteArrayToString(body);
  body = [];
  return new e2e.openpgp.packet.UserId(userId);
};


/** @inheritDoc */
e2e.openpgp.packet.UserId.prototype.serializePacketBody = function() {
  return e2e.stringToByteArray(this.userId);
};


/** @override */
e2e.openpgp.packet.UserId.prototype.serialize = function() {
  var serialized = goog.base(this, 'serialize');
  if (this.certifications_.length > 0) {
    goog.array.extend(serialized, goog.array.flatten(
        goog.array.map(
            this.certifications_,
            function(sig) {
              return sig.serialize();
            })));
  }
  return serialized;
};


/**
 * @param {e2e.openpgp.packet.Signature} sig
 */
e2e.openpgp.packet.UserId.prototype.addCertification = function(sig) {
  this.certifications_.push(sig);
};


/**
 * @return {Array.<e2e.openpgp.packet.Signature>} certifications
 */
e2e.openpgp.packet.UserId.prototype.getCertifications = function() {
  return this.certifications_;
};


/**
 * @param {e2e.openpgp.packet.SecretKey} key
 */
e2e.openpgp.packet.UserId.prototype.certifyBy = function(key) {
  var keyData = key.getPublicKeyPacket().serializePacketBody();
  if (keyData.length > 0xFFFF) {
    throw new e2e.openpgp.error.SerializationError(
        'Key data is too long to serialize.');
  }
  var data = [];
  // Signature prefix.
  goog.array.extend(data, [0x99]);
  goog.array.extend(
      data,
      e2e.dwordArrayToByteArray([keyData.length]).slice(2));
  // Public Key data (without packet tag header).
  goog.array.extend(data, keyData);
  goog.array.extend(data, [0xB4]);
  goog.array.extend(data,
      e2e.dwordArrayToByteArray([this.userId.length]));
  goog.array.extend(data,
      e2e.stringToByteArray(this.userId));
  var sig = e2e.openpgp.packet.Signature.construct(
      key,
      data,
      e2e.openpgp.packet.Signature.SignatureType.GENERIC_USER_ID,
      this.getSignatureAttributes_(key));

  this.addCertification(sig);
};

/**
 * Returns key certification signature attributes, including End-to-End
 * algorithm preferences.
 * @param {e2e.openpgp.packet.SecretKey} key
 * @return {Object.<string, number|!e2e.ByteArray>}  Attributes
 * @private
 */
e2e.openpgp.packet.UserId.prototype.getSignatureAttributes_ = function(key) {
  // Prefer only SHA-2 family.
  var hashAlgos = [
      e2e.hash.Algorithm.SHA256,
      e2e.hash.Algorithm.SHA384,
      e2e.hash.Algorithm.SHA512,
      e2e.hash.Algorithm.SHA224
  ];
  var hashIds = goog.array.map(hashAlgos, e2e.openpgp.constants.getId);
  // Prefer all available compression mechanisms.
  var compressionAlgos = e2e.compression.factory.getAvailable();
  var compressionIds = goog.array.map(compressionAlgos,
      e2e.openpgp.constants.getId);
  // Prefer only the default symmetric algorithm (AES-256).
  var symAlgos = [
    e2e.openpgp.constants.DEFAULT_SYMMETRIC_CIPHER
  ];
  var symIds = goog.array.map(symAlgos, e2e.openpgp.constants.getId);

  return {
        'SIGNATURE_CREATION_TIME': e2e.dwordArrayToByteArray(
          [Math.floor(new Date().getTime() / 1e3)]),
        'ISSUER': key.keyId,
        'PREFERRED_SYMMETRIC_ALGORITHMS': symIds,
        'PREFERRED_HASH_ALGORITHMS': hashIds,
        'PREFERRED_COMPRESSION_ALGORITHMS': compressionIds,
        'FEATURES': [0x01] // Modification detection. See RFC 4880 5.2.3.24.
      };
};

e2e.openpgp.packet.factory.add(e2e.openpgp.packet.UserId);
