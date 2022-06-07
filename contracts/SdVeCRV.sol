// SPDX-License-Identifier: MIT
// veCRV Rewarder

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

import "./Ownable.sol";

interface GController {
  function gauge_types(address _addr) external view returns (int128);
}


contract SdVeCRV is Ownable {

  using SafeERC20 for IERC20;

  /* ========== STATE VARIABLES ========== */

  mapping(address => bool) public tokenListed;       // accepted tokens
  mapping(address => bool) public approvedTeam;      // for team functions that do not require multi-sig security

  address public feeAddress; // SD fee address => SplitFunds contract
  uint256 public platformFee = 150;             // 1.5%
  uint256 public constant DENOMINATOR = 10000;  // denominates weights 10000 = 100%

  address public distributor; // Multi merkle stash contract

  GController public gc = GController(0x2F50D538606Fa9EDD2B11E2446BEb18C9D5846bB); // Curve gauge controller



  /* ========== CONSTRUCTOR ========== */

  constructor(address _feeAddress, address _distributor) {
    feeAddress = _feeAddress;
    distributor = _distributor;
    approvedTeam[msg.sender] = true;
  }

  /* ========== PUBLIC FUNCTIONS ========== */

  // Deposit vote incentive
  function depositReward(address _token, uint256 _amount, uint256 _week, address _gauge) public {
    require(tokenListed[_token] == true, "token unlisted");
    require(_week > week(), "week expired");  // must give voters an entire week to vote
    require(_week < week()+7, "more than 6 weeks ahead"); // cannot post future rewards beyond 6 weeks
    require(gc.gauge_types(_gauge) >= 0, "invalid gauge");  // check gauge controller to ensure valid gauge
    require(distributor != address(0), "distributor not set"); // prevent deposits if distributor is 0x0

    uint256 fee = _amount*platformFee/DENOMINATOR;
    uint256 rewardTotal = _amount-fee;
    IERC20(_token).safeTransferFrom(msg.sender, feeAddress, fee); // transfer to fee address
    IERC20(_token).safeTransferFrom(msg.sender, distributor, rewardTotal);  // transfer to distributor
    emit NewReward(_token, rewardTotal, _week, _gauge);
  }

	// current week number
  function week() public view returns (uint256) {
    return block.timestamp/(86400*7);
  }


  /* ========== APPROVED TEAM FUNCTIONS ========== */


  // list token
  function listToken(address _token) public onlyTeam {
	  tokenListed[_token] = true;
	  emit Listed(_token);
  }

  // list multiple tokens
  function listTokens(address[] memory _tokens) public onlyTeam {
	  for(uint256 i=0;i<_tokens.length;++i) {
		  tokenListed[_tokens[i]] = true;
		  emit Listed(_tokens[i]);
	  }
  }


  /* ========== MUTLI-SIG FUNCTIONS ========== */

	// unlist token
  function unlistToken(address _token) public onlyOwner {
	  tokenListed[_token] = false;
	  emit Unlisted(_token);
  }

  // update fee address
  function updateFeeAddress(address _feeAddress) public onlyOwner {
	  feeAddress = _feeAddress;
  }

  // update token distributor address
  function updateDistributor(address _distributor) public onlyOwner {
	  // can be changed for future use in case of cheaper gas options than current merkle approach
	  distributor = _distributor;
	  emit UpdatedDistributor(_distributor);
  }

  // update fee amount
  function updateFeeAmount(uint256 _feeAmount) public onlyOwner {
	  require(_feeAmount < 400, "max fee"); // Max fee 4%
	  platformFee = _feeAmount;
	  emit UpdatedFee(_feeAmount);
  }

  // add or remove address from team functions
  function modifyTeam(address _member, bool _approval) public onlyOwner {
	  approvedTeam[_member] = _approval;
	  emit ModifiedTeam(_member, _approval);
  }

  // update curve gauge controller (for gauge validation)
  function updateGaugeController(address _gc) public onlyOwner {
	  gc = GController(_gc);
  }


  /* ========== MODIFIERS ========== */

  modifier onlyTeam() {
	  require(approvedTeam[msg.sender] == true, "Team only");
	  _;
  }

  /* ========== EVENTS ========== */

  event NewReward(address indexed _token, uint256 _amount, uint256 indexed _week, address indexed _gauge);
  event Listed(address _token);
  event Unlisted(address _token);
  event UpdatedFee(uint256 _feeAmount);
  event ModifiedTeam(address _member, bool _approval);
  event UpdatedDistributor(address _distributor);

}